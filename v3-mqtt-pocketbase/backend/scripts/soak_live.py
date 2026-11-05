#!/usr/bin/env python3
"""soak_live.py — PigPulse Pi 4B edge soak live monitoring TUI / stream viewer.

Runs against a live Pi via SSH (running soak_collect.py --stream) or a local
JSONL file (--stream-file). Renders a rich terminal UI or plain text fallback.
Includes a robust --selftest mode.

Contract: v3-mqtt-pocketbase/docs/SOAK_CONTRACT.md §7.
stdlib only + rich (if importable). Python 3.9+.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple

# Try importing rich; fallback gracefully if missing
try:
    from rich import box
    from rich.console import Console
    from rich.layout import Layout
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

# Sparkline blocks (8 levels)
SPARK_BLOCKS = "  ▂▃▄▅▆▇█"

def sparkline(values: List[float], width: int = 40) -> str:
    if not values:
        return ""
    # Take last N values matching width
    vals = values[-width:]
    if not vals:
        return ""
    mn = min(vals)
    mx = max(vals)
    rng = mx - mn
    if rng == 0:
        rng = 1.0
    res = []
    for v in vals:
        norm = (v - mn) / rng
        idx = int(norm * (len(SPARK_BLOCKS) - 1))
        idx = max(0, min(idx, len(SPARK_BLOCKS) - 1))
        res.append(SPARK_BLOCKS[idx])
    return "".join(res)


def format_temp(temp: Optional[float]) -> str:
    if temp is None:
        return "N/A"
    return f"{temp:.1f}°C"


def get_temp_color(temp: Optional[float]) -> str:
    if temp is None:
        return "white"
    if temp < 70.0:
        return "green"
    elif temp < 80.0:
        return "yellow"
    else:
        return "bold red"


class SoakLiveViewer:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.samples: List[Dict[str, Any]] = []
        self.events: List[Dict[str, Any]] = []
        self.sample_count = 0
        self.running = True
        self.console = (Console()
                        if HAS_RICH and not args.no_tty and sys.stdout.isatty()
                        else None)

    def parse_line(self, line: str) -> Optional[Dict[str, Any]]:
        line = line.strip()
        if not line:
            return None
        try:
            data = json.loads(line)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
        return None

    def handle_record(self, record: Dict[str, Any]) -> None:
        rec_type = record.get("type")
        if rec_type == "sample" or "cpu_temp_c" in record:
            self.samples.append(record)
            self.sample_count += 1
            if len(self.samples) > 200:
                self.samples.pop(0)
        elif rec_type in ("event", "sample_error") or "event_type" in record:
            # sample_error carries "error" instead of "detail" — kept for the
            # rich ticker (plain mode prints it separately to stderr).
            self.events.append(record)
            if len(self.events) > 50:
                self.events.pop(0)

    def pb_rate_per_min(self) -> Optional[float]:
        """PocketBase telemetry rows/min from the buffered samples.

        The collector reports pb_new_total as the number of new telemetry rows
        since the *previous* sample, so rate = Σdelta / Σdt × 60. None deltas
        (DB rotated) and non-positive dt are skipped.
        """
        pts = [(s.get("ts"), s.get("pb_new_total")) for s in self.samples]
        tot_dv = 0
        tot_dt = 0.0
        for (ts0, _v0), (ts1, v1) in zip(pts, pts[1:]):
            if ts0 is None or ts1 is None or v1 is None:
                continue
            dt = ts1 - ts0
            if dt <= 0:
                continue
            tot_dt += dt
            tot_dv += max(0, int(v1))
        if tot_dt <= 0:
            return None
        return tot_dv / tot_dt * 60.0

    def render_plain(self, latest: Dict[str, Any]) -> str:
        temp = latest.get("cpu_temp_c")
        freq = latest.get("cpu_freq_mhz")
        thr = latest.get("throttle_hex")
        thr_s = thr if thr is not None else "N/A"
        load1 = latest.get("load1")
        own_cpu = latest.get("own_cpu_pct")
        mem_u = latest.get("mem_used_mb")
        mem_t = latest.get("mem_total_mb")
        disk_f = latest.get("disk_free_mb")
        th_ok = latest.get("th_ok")
        fps = latest.get("th_fps")
        read_ms = latest.get("th_read_ms")
        verdict = latest.get("th_verdict", "N/A")
        esp_conn = latest.get("esp_conn")
        esp_stale = latest.get("esp_stale")
        esp_last = latest.get("esp_last_ms")
        esp_nz = latest.get("esp_nonzero_pct")
        amb_state = latest.get("amb_state", "N/A")
        amb_t = latest.get("amb_temp_c")
        amb_rh = latest.get("amb_rh")
        amb_thi = latest.get("amb_thi")
        pb_total = latest.get("pb_new_total")
        pb_rate = self.pb_rate_per_min()
        pb_str = (f"{pb_total} rows/sample" if pb_total is not None else "N/A")
        pb_rate_str = (f"{pb_rate:.1f}/min" if pb_rate is not None else "n/a")
        wifi_c = latest.get("wifi_clients")
        eth = latest.get("eth_oper", "N/A")
        wlan = latest.get("wlan_oper", "N/A")

        temps = [s.get("cpu_temp_c") for s in self.samples if s.get("cpu_temp_c") is not None]
        spark = sparkline(temps, width=30)

        line = (
            f"[{self.sample_count}] Temp: {format_temp(temp)} | Freq: {freq}MHz | Thr: {thr_s} | "
            f"Load1: {load1} | Mem: {mem_u}/{mem_t}MB | DiskFree: {disk_f}MB | "
            f"Thermal OK: {th_ok} (fps:{fps}, ms:{read_ms}, {verdict}) | "
            f"ESP: conn={esp_conn}, stale={esp_stale}, lastMs={esp_last}, nz={esp_nz}% | "
            f"Amb: {amb_state} t={amb_t}C rh={amb_rh}% thi={amb_thi} | "
            f"PB new: {pb_str} ({pb_rate_str}) | WiFi clients: {wifi_c} | Net: eth={eth} wlan={wlan} | Spark: [{spark}]"
        )
        return line

    def render_rich(self) -> None:
        if not self.console or not HAS_RICH:
            return
        if not self.samples:
            self.console.print("[yellow]Waiting for soak stream data...[/yellow]")
            return

        latest = self.samples[-1]

        # Build Layout / Panels
        table = Table(title="PigPulse Pi Soak Live Monitor", box=box.ROUNDED, expand=True)
        table.add_column("Metric", style="cyan", width=20)
        table.add_column("Value", style="magenta")
        table.add_column("Metric", style="cyan", width=20)
        table.add_column("Value", style="magenta")

        temp = latest.get("cpu_temp_c")
        t_col = get_temp_color(temp)
        temp_str = f"[{t_col}]{format_temp(temp)}[/]" if temp is not None else "N/A"

        thr = latest.get("throttle_hex")
        if thr is None:
            thr_str = "[grey62]unknown[/]"
        elif thr == "0x0":
            thr_str = f"[green]{thr}[/]"
        else:
            thr_str = f"[bold red]{thr}[/]"

        th_ok = latest.get("th_ok")
        th_str = f"[green]OK[/]" if th_ok == 1 else f"[red]DOWN ({th_ok})[/]"

        esp_conn = latest.get("esp_conn")
        esp_str = f"[green]Connected[/]" if esp_conn == 1 else f"[red]Disconnected ({esp_conn})[/]"

        temps = [s.get("cpu_temp_c") for s in self.samples if s.get("cpu_temp_c") is not None]
        spark = sparkline(temps, width=120)

        pb_rate = self.pb_rate_per_min()
        pb_rate_str = f"{pb_rate:.1f} rows/min" if pb_rate is not None else "n/a"
        pb_val = latest.get("pb_new_total")
        pb_val_str = "N/A" if pb_val is None else str(pb_val)

        table.add_row("CPU Temp", temp_str, "CPU Freq", f"{latest.get('cpu_freq_mhz')} MHz")
        table.add_row("Throttle Status", thr_str, "Load Avg (1m)", str(latest.get("load1")))
        table.add_row("Memory Used", f"{latest.get('mem_used_mb')} / {latest.get('mem_total_mb')} MB", "Disk Free", f"{latest.get('disk_free_mb')} MB")
        table.add_row("Thermal Pipeline", th_str, "Thermal FPS / Read", f"{latest.get('th_fps')} fps / {latest.get('th_read_ms')} ms")
        table.add_row("Thermal Verdict", str(latest.get("th_verdict")), "Thermal Animals", str(latest.get("th_animals")))
        table.add_row("ESP32-S3 Mic", esp_str, "ESP Nonzero %", f"{latest.get('esp_nonzero_pct')}%")
        table.add_row("Ambient State", str(latest.get("amb_state")), "Ambient THI", f"{latest.get('amb_thi')} (T:{latest.get('amb_temp_c')}°C)")
        table.add_row("PB New Rows / Rate", f"{pb_val_str} ({pb_rate_str})", "WiFi Clients", str(latest.get("wifi_clients")))
        table.add_row("Network Oper", f"eth:{latest.get('eth_oper')} wlan:{latest.get('wlan_oper')} fam", "Own CPU / RSS", f"{latest.get('own_cpu_pct')}% / {latest.get('own_rss_mb')}MB")
        table.add_row("CPU Temp Sparkline", f"[blue]{spark}[/]", "Samples Received", str(self.sample_count))

        # Events ticker (last 8)
        recent_events = self.events[-8:]
        ev_text = Text()
        if not recent_events:
            ev_text.append("No events recorded yet.", style="dim")
        else:
            for ev in recent_events:
                ev_type = ev.get("event_type") or ev.get("type", "event")
                detail = ev.get("detail") or ev.get("error") or ""
                ev_text.append(f"• [{ev_type}] {detail}\n", style="yellow")

        panel_events = Panel(ev_text, title="Event Ticker (Last Events)", border_style="blue")

        self.console.clear()
        self.console.print(table)
        self.console.print(panel_events)

    @staticmethod
    def _read_stderr_text(err_fh) -> str:
        """Drain captured remote stderr (binary temp file) into a text string."""
        if err_fh is None:
            return ""
        try:
            err_fh.seek(0)
            raw = err_fh.read()
        except (OSError, ValueError):
            return ""
        if isinstance(raw, bytes):
            return raw.decode("utf-8", "replace").strip()
        return str(raw).strip()

    def _report_stream_end(self, proc: subprocess.Popen, err_fh) -> int:
        """Print why the stream ended; returns exit code 1 (unexpected end)."""
        err_text = self._read_stderr_text(err_fh)
        msg = f"Stream ended unexpectedly (exit code {proc.returncode})."
        if err_text:
            msg += f"\nRemote stderr: {err_text}"
        print(msg, file=sys.stderr)
        return 1

    def run_stream_source(self) -> int:
        """Follow the soak stream until stopped.

        Exit codes: 0 = KeyboardInterrupt, --count reached, or normal EOF on
        stdin; 1 = remote stream died before --count was reached, or setup
        failed (bad host).
        """
        proc: Optional[subprocess.Popen] = None
        file_fh = None
        err_fh = None
        exit_code = 0

        try:
            if self.args.stream_file:
                if self.args.stream_file == "-":
                    file_fh = sys.stdin
                else:
                    file_fh = open(self.args.stream_file, "r", encoding="utf-8")
                    # Seek to end (tail -f style: follow only new lines)
                    file_fh.seek(0, os.SEEK_END)
            else:
                host = self.args.host
                if not host:
                    print("Error: Either --host or --stream-file must be specified.", file=sys.stderr)
                    return 1

                remote_cmd = f"python3 /home/pigpulse/scripts/soak/soak_collect.py --stream --interval {self.args.interval}"
                cmd = [
                    "ssh",
                    "-o", "BatchMode=yes",
                    "-o", "ConnectTimeout=8",
                    host,
                    remote_cmd
                ]
                # stderr goes to a binary temp file instead of a pipe: nothing
                # drains a pipe during a long follow, so ssh would eventually
                # block writing warnings and silently stall the stream.
                err_fh = tempfile.TemporaryFile()
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=err_fh,
                    text=True,
                    bufsize=1
                )
                file_fh = proc.stdout

            while self.running:
                if proc is not None and proc.poll() is not None:
                    # Remote exited on its own — unexpected unless --count done.
                    if not (self.args.count > 0 and self.sample_count >= self.args.count):
                        exit_code = self._report_stream_end(proc, err_fh)
                    break

                if file_fh:
                    line = file_fh.readline()
                    if not line:
                        if self.args.stream_file and self.args.stream_file != "-":
                            time.sleep(0.5)
                            continue
                        if proc is not None:
                            # stdout hit EOF before poll() noticed: let the
                            # process reap, then loop once more for its exit
                            # code (and message, if it died early).
                            try:
                                proc.wait(timeout=3)
                            except subprocess.TimeoutExpired:
                                proc.terminate()
                                try:
                                    proc.wait(timeout=2)
                                except subprocess.TimeoutExpired:
                                    proc.kill()
                            continue
                        break  # stdin EOF — normal end of input

                    record = self.parse_line(line)
                    if record:
                        self.handle_record(record)
                        if self.console is None:
                            rtype = record.get("type")
                            if rtype == "sample" or "cpu_temp_c" in record:
                                print(self.render_plain(record))
                            elif rtype == "event" or "event_type" in record:
                                ev_type = record.get("event_type") or "event"
                                print(f"[{self.sample_count}] EVENT {ev_type}: {record.get('detail', '')}")
                            elif rtype == "sample_error":
                                print(f"[{self.sample_count}] ERROR sample_error: {record.get('error', '')}",
                                      file=sys.stderr)
                            # unknown record types: skip silently
                            sys.stdout.flush()
                        else:
                            self.render_rich()

                        if self.args.count > 0 and self.sample_count >= self.args.count:
                            self.running = False
                            break

        except KeyboardInterrupt:
            exit_code = 0
            self.running = False
        finally:
            if proc is not None and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
            if file_fh and file_fh != sys.stdin and hasattr(file_fh, "close"):
                file_fh.close()
            if err_fh is not None:
                err_fh.close()

        return exit_code

    def selftest(self) -> int:
        print("Running soak_live.py --selftest...")
        synthetic_lines = [
            '{"type": "sample", "ts": 1793840000.0, "cpu_temp_c": 55.5, "cpu_freq_mhz": 1500.0, "throttle_hex": "0x0", "load1": 0.5, "mem_used_mb": 500.0, "mem_total_mb": 3795.0, "disk_free_mb": 15000.0, "th_ok": 1, "th_fps": 10.0, "th_read_ms": 50, "th_verdict": "NORMAL", "esp_conn": 1, "esp_stale": 0, "esp_last_ms": 2, "esp_nonzero_pct": 99.5, "amb_state": "live", "amb_temp_c": 25.0, "amb_rh": 50.0, "amb_thi": 70.0, "pb_new_total": 5, "wifi_clients": 1, "eth_oper": "up", "wlan_oper": "up"}',
            '{"type": "event", "event_type": "throttle_change", "detail": "0x0->0x50000"}',
            '{"type": "sample_error", "error": "LEAK: out-of-range value"}',
            '{"type": "sample", "ts": 1793840010.0, "cpu_temp_c": 75.2, "cpu_freq_mhz": 1500.0, "throttle_hex": "0x50000", "load1": 1.2, "mem_used_mb": 520.0, "mem_total_mb": 3795.0, "disk_free_mb": 14900.0, "th_ok": 1, "th_fps": 9.8, "th_read_ms": 55, "th_verdict": "WARNING", "esp_conn": 1, "esp_stale": 0, "esp_last_ms": 3, "esp_nonzero_pct": 99.0, "amb_state": "live", "amb_temp_c": 26.0, "amb_rh": 52.0, "amb_thi": 72.0, "pb_new_total": 12, "wifi_clients": 2, "eth_oper": "up", "wlan_oper": "up"}',
            'malformed json line here',
            '{"type": "sample", "ts": 1793840020.0, "cpu_temp_c": 82.1, "cpu_freq_mhz": 1200.0, "throttle_hex": "0x50000", "load1": 2.5, "mem_used_mb": 550.0, "mem_total_mb": 3795.0, "disk_free_mb": 14800.0, "th_ok": 0, "th_fps": 0.0, "th_read_ms": 500, "th_verdict": "ERROR", "esp_conn": 0, "esp_stale": 1, "esp_last_ms": 5000, "esp_nonzero_pct": 0.0, "amb_state": "stale", "amb_temp_c": null, "amb_rh": null, "amb_thi": null, "pb_new_total": 0, "wifi_clients": 0, "eth_oper": "up", "wlan_oper": "down"}'
        ]

        try:
            # Test parsing and handling
            for line in synthetic_lines:
                rec = self.parse_line(line)
                if rec:
                    self.handle_record(rec)

            assert self.sample_count == 3, f"Expected 3 samples, got {self.sample_count}"
            assert len(self.events) == 2, f"Expected 2 events, got {len(self.events)}"
            assert self.events[1].get("error") == "LEAK: out-of-range value"

            # Test render plain
            latest = self.samples[-1]
            plain_out = self.render_plain(latest)
            assert "82.1°C" in plain_out, f"Plain render missing temp: {plain_out}"

            # PB rate helper: delta 12 rows over the 20 s window → 36.0/min
            rate = self.pb_rate_per_min()
            assert rate is not None and abs(rate - 36.0) < 0.01, f"pb rate={rate}"

            # Test rich render pass even when stdout is not a tty (CI / pipes):
            # the test builds its own Console regardless of self.console.
            if HAS_RICH:
                with StringIO() as buf:
                    test_console = Console(file=buf, width=100)
                    orig_console = self.console
                    self.console = test_console
                    try:
                        self.render_rich()
                        output = buf.getvalue()
                        assert "PigPulse Pi Soak Live Monitor" in output
                    finally:
                        self.console = orig_console
            else:
                print("note: rich not installed; skipping rich render test.")

            print("PASS: soak_live selftest completed successfully.")
            return 0
        except Exception as e:
            print(f"FAIL: soak_live selftest exception: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            return 2


def main() -> None:
    parser = argparse.ArgumentParser(description="PigPulse Pi soak live viewer / stream client.")
    parser.add_argument("--host", help="SSH target host (e.g. pigpulse@192.168.69.1)")
    parser.add_argument("--interval", type=int, default=2, help="Sample interval for remote collector (default: 2)")
    parser.add_argument("--count", type=int, default=0, help="Exit after N samples (default: 0 = forever)")
    parser.add_argument("--stream-file", help="Tail-follow local JSONL file instead of SSH")
    parser.add_argument("--no-tty", action="store_true", help="Plain text fallback output, no ANSI / rich")
    parser.add_argument("--selftest", action="store_true", help="Run functional selftest and exit")
    parser.add_argument("--db", help="Ignored in live viewer (accepted for CLI compatibility)")

    args = parser.parse_args()

    viewer = SoakLiveViewer(args)
    if args.selftest:
        sys.exit(viewer.selftest())

    if not args.host and not args.stream_file:
        parser.error("Either --host or --stream-file must be specified (unless --selftest).")

    sys.exit(viewer.run_stream_source())


if __name__ == "__main__":
    main()
