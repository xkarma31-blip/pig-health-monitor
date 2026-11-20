#!/usr/bin/env python3
"""Static guard against code paths that connect to the single-client mic.

The ESP32-S3 PCM listener accepts one client.  A second TCP connection can evict
live audio, so the technician-console verifier must never probe it.

This module intentionally has no network-client imports.  It parses Python
source and reports source lines that can actively target TCP :9090.  It is a
static preflight, not a sandbox: the verifier also samples ``/proc`` while its
child runs and attributes any observed outbound socket to that child when
possible.
"""

from __future__ import annotations

import ast
import re
from typing import Any, NamedTuple


MIC_PORT = 9090

_NETWORK_SYMBOLS = {
    "probe",
    "urlopen",
    "request_ctor",
    "http_connection",
    "https_connection",
    "socket_create_connection",
}


class _Symbol(NamedTuple):
    kind: str
    value: Any = None


class _Analyzer(ast.NodeVisitor):
    """Resolve the small subset of aliases needed to identify mic probes."""

    def __init__(self) -> None:
        self.lines: set[int] = set()
        self.env: dict[str, _Symbol] = {}

    # -- assignments and imports -------------------------------------------
    def visit_Assign(self, node: ast.Assign) -> None:
        self.visit(node.value)
        symbol = self._symbol(node.value)
        for target in node.targets:
            self._bind(target, symbol)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        if node.value is not None:
            self.visit(node.value)
            self._bind(node.target, self._symbol(node.value))
        else:
            self.visit(node.annotation)

    def visit_NamedExpr(self, node: ast.NamedExpr) -> None:
        self.visit(node.value)
        self._bind(node.target, self._symbol(node.value))

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if alias.asname:
                self.env[alias.asname] = _Symbol("namespace", alias.name)
            else:
                # ``import urllib.request`` binds ``urllib``; the dotted
                # call name still carries the full namespace.
                self.env[alias.name.split(".", 1)[0]] = _Symbol(
                    "namespace", alias.name.split(".", 1)[0]
                )

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        for alias in node.names:
            name = alias.asname or alias.name
            kind = self._imported_kind(module, alias.name)
            self.env[name] = _Symbol(kind) if kind else _Symbol("unknown")

    def _imported_kind(self, module: str, name: str) -> str | None:
        if module == "urllib.request":
            return {
                "urlopen": "urlopen",
                "Request": "request_ctor",
            }.get(name)
        if module == "http.client":
            return {
                "HTTPConnection": "http_connection",
                "HTTPSConnection": "https_connection",
            }.get(name)
        if module == "socket" and name == "create_connection":
            return "socket_create_connection"
        if name == "port_open":
            return "probe"
        return None

    def _bind(self, target: ast.AST, symbol: _Symbol | None) -> None:
        if symbol is None:
            return
        if isinstance(target, ast.Name):
            self.env[target.id] = symbol
        elif isinstance(target, (ast.Tuple, ast.List)):
            for item in target.elts:
                self._bind(item, symbol)

    # -- scopes --------------------------------------------------------------
    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        for decorator in node.decorator_list:
            self.visit(decorator)
        for default in (*node.args.defaults, *node.args.kw_defaults):
            if default is not None:
                self.visit(default)
        outer = self.env
        self.env = dict(outer)
        for statement in node.body:
            self.visit(statement)
        self.env = outer

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        for decorator in node.decorator_list:
            self.visit(decorator)
        for default in (*node.args.defaults, *node.args.kw_defaults):
            if default is not None:
                self.visit(default)
        outer = self.env
        self.env = dict(outer)
        for statement in node.body:
            self.visit(statement)
        self.env = outer

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        for decorator in node.decorator_list:
            self.visit(decorator)
        for base in node.bases:
            self.visit(base)
        outer = self.env
        self.env = dict(outer)
        for statement in node.body:
            self.visit(statement)
        self.env = outer

    # -- calls ---------------------------------------------------------------
    def visit_Call(self, node: ast.Call) -> None:
        if self._targets_mic(node):
            self.lines.add(node.lineno)
        self.generic_visit(node)

    def _targets_mic(self, node: ast.Call) -> bool:
        kind = self._call_kind(node)
        if kind == "probe":
            keyword = self._keyword(node, "port")
            if keyword is not None:
                return self._numeric_is_mic(keyword)
            return bool(node.args and self._numeric_is_mic(node.args[0]))

        if kind == "socket_create_connection":
            keyword = self._keyword(node, "port")
            if keyword is not None:
                return self._numeric_is_mic(keyword)
            return bool(node.args and self._address_is_mic(node.args[0]))

        if kind == "socket_connect":
            keyword = self._keyword(node, "port")
            if keyword is not None:
                return self._numeric_is_mic(keyword)
            if node.args and self._address_is_mic(node.args[0]):
                return True
            # socket.connect(host, port) uses two positional arguments.
            return any(self._numeric_is_mic(arg) for arg in node.args[1:])

        if kind in {"urlopen", "request_ctor"}:
            keyword = self._keyword(node, "url")
            target = keyword if keyword is not None else (node.args[0] if node.args else None)
            return bool(target is not None and self._url_is_mic(target))

        if kind in {"http_connection", "https_connection"}:
            keyword = self._keyword(node, "port")
            if keyword is not None:
                return self._numeric_is_mic(keyword)
            return bool(len(node.args) > 1 and self._numeric_is_mic(node.args[1]))

        return False

    def _call_kind(self, node: ast.Call) -> str | None:
        path = self._dotted_name(node.func)
        if not path:
            return None
        base = path.rsplit(".", 1)[-1]
        symbol = self.env.get(path.split(".", 1)[0])
        symbol_kind = symbol.kind if symbol else ""

        if symbol_kind in _NETWORK_SYMBOLS:
            return symbol_kind
        name_kind = self._kind_for_name(base)
        if name_kind:
            return name_kind
        if base in {"connect", "connect_ex"}:
            return "socket_connect"
        return None

    @staticmethod
    def _dotted_name(node: ast.AST) -> str | None:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            parent = _Analyzer._dotted_name(node.value)
            return f"{parent}.{node.attr}" if parent else node.attr
        return None

    @staticmethod
    def _kind_for_name(name: str) -> str | None:
        return {
            "port_open": "probe",
            "urlopen": "urlopen",
            "Request": "request_ctor",
            "HTTPConnection": "http_connection",
            "HTTPSConnection": "https_connection",
            "create_connection": "socket_create_connection",
        }.get(name)

    @staticmethod
    def _keyword(node: ast.Call, name: str) -> ast.AST | None:
        return next((kw.value for kw in node.keywords if kw.arg == name), None)

    # -- value resolution ----------------------------------------------------
    def _symbol(self, node: ast.AST) -> _Symbol | None:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool):
                return None
            if isinstance(node.value, int):
                return _Symbol("int", node.value)
            if isinstance(node.value, str):
                return _Symbol("str", node.value)
            return None

        if isinstance(node, ast.Name):
            symbol = self.env.get(node.id)
            if symbol:
                return symbol
            if node.id == "port_open":
                return _Symbol("probe")
            return None

        if isinstance(node, ast.Attribute):
            kind = self._kind_for_name(node.attr)
            return _Symbol(kind) if kind else None

        if isinstance(node, ast.JoinedStr):
            text = self._string_value(node)
            return _Symbol("str", text) if text is not None else None

        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            left = self._string_value(node.left)
            right = self._string_value(node.right)
            if left is not None and right is not None:
                return _Symbol("str", left + right)
            return None

        if isinstance(node, ast.Call):
            kind = self._call_kind(node)
            if kind == "request_ctor":
                target = self._keyword(node, "url")
                if target is None and node.args:
                    target = node.args[0]
                url = self._string_value(target) if target is not None else None
                if url is not None:
                    return _Symbol("request", url)
            if kind in {"http_connection", "https_connection"}:
                keyword = self._keyword(node, "port")
                target = keyword if keyword is not None else (
                    node.args[1] if len(node.args) > 1 else None
                )
                port = self._numeric_value(target) if target is not None else None
                if port is not None:
                    return _Symbol("connection", port)
        return None

    def _string_value(self, node: ast.AST | None) -> str | None:
        if node is None:
            return None
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.Name):
            symbol = self.env.get(node.id)
            if symbol and symbol.kind in {"str", "request"}:
                return str(symbol.value)
            return None
        if isinstance(node, ast.JoinedStr):
            parts: list[str] = []
            for value in node.values:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    parts.append(value.value)
                elif isinstance(value, ast.FormattedValue):
                    resolved = self._string_value(value.value)
                    if resolved is None:
                        numeric = self._numeric_value(value.value)
                        if numeric is None:
                            return None
                        resolved = str(numeric)
                    parts.append(resolved)
                else:
                    return None
            return "".join(parts)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            left = self._string_value(node.left)
            right = self._string_value(node.right)
            if left is not None and right is not None:
                return left + right
        return None

    def _numeric_value(self, node: ast.AST | None) -> int | None:
        if node is None:
            return None
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool):
                return None
            if isinstance(node.value, int):
                return node.value
            if isinstance(node.value, str) and node.value.isdecimal():
                return int(node.value)
            return None
        if isinstance(node, ast.Name):
            symbol = self.env.get(node.id)
            if not symbol:
                return None
            if symbol.kind == "int" and isinstance(symbol.value, int):
                return symbol.value
            if symbol.kind == "str" and isinstance(symbol.value, str):
                try:
                    return int(symbol.value, 0)
                except ValueError:
                    return None
        return None

    def _numeric_is_mic(self, node: ast.AST) -> bool:
        return self._numeric_value(node) == MIC_PORT

    def _address_is_mic(self, node: ast.AST) -> bool:
        if isinstance(node, (ast.Tuple, ast.List)):
            return any(self._numeric_is_mic(item) for item in node.elts)
        return self._numeric_is_mic(node)

    def _url_is_mic(self, node: ast.AST) -> bool:
        url = self._string_value(node)
        if not url:
            return False
        match = re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://([^/]+)", url)
        if not match:
            return False
        authority = match.group(1).rsplit("@", 1)[-1]
        if authority.startswith("["):
            closing = authority.find("]")
            if closing < 0:
                return False
            port_text = authority[closing + 1:]
            if port_text.startswith(":"):
                port_text = port_text[1:]
        elif ":" in authority:
            port_text = authority.rsplit(":", 1)[1]
        else:
            return False
        return port_text.isdecimal() and int(port_text) == MIC_PORT


def active_mic_connection_lines(source: str) -> list[int]:
    """Return lines that can actively connect to the mic's TCP :9090 port.

    The scan resolves constant, URL, request, probe, and import aliases.  It
    deliberately ignores binds/listens: the production ingest owns the local
    listener and does not connect to the board.
    """

    analyzer = _Analyzer()
    analyzer.visit(ast.parse(source, filename="<mic-port-guard>"))
    return sorted(analyzer.lines)
