#!/usr/bin/env python3
"""Tolerant JSON parsing for device telemetry payloads.

WHY THIS EXISTS
---------------
The ESP32-S3 barn mic (firmware
`firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry-flashed-20261111/`)
builds its MQTT telemetry payload by concatenating a fixed prefix with two
optional fragments. On 2026-11-12 the live board was measured publishing
messages like:

    {"mic":true,"rms":162368,...,"boots":1,"rr":1,"br":0,"txp":34,}

That trailing comma before `}` makes the whole document **invalid JSON**.
Every strict parser rejects it:

    json.loads(...) -> ValueError: Illegal trailing comma before end of object

Measured impact on the Pi: 60 of 61 messages were rejected. The bridge logged
`Invalid JSON on pig/s3-mic-01/telemetry` for every one, and the SHT45
ambient readings the message carried (e.g. temperature 34.25 C, humidity
65.50 %) were thrown away — 498,518 telemetry rows stored with
`ambient=0, humidity=0, mic=False`.

The SHT45 sensor was healthy the whole time. The data was lost purely in
transport, before it reached PocketBase.

WHAT THIS DOES
--------------
`loads_lenient()` retries a strict parse and, on failure, strips trailing
commas before `}` / `]` and parses again. If that still fails, the payload is
genuinely unparseable and the error is raised as before — this never invents
data or silently accepts garbage.

This is a TRANSPORT-side mitigation. The firmware itself still emits invalid
JSON and should be fixed at the source; this module exists so a firmware
defect cannot cost us the telemetry in the meantime.

CONTRACT
--------
- A valid JSON document is returned exactly as `json.loads` would return it.
- A document that differs only by trailing commas is returned with those
  commas removed.
- Anything else raises the original `ValueError`.
"""

from __future__ import annotations

import json
from typing import Any

def strip_trailing_commas(text: str) -> str:
    """Remove commas that directly precede a closing brace/bracket.

    String-aware: a `,` inside a JSON string literal is never touched, even
    when the document is also broken elsewhere. That matters because the
    repair only runs on documents that already failed a strict parse, so
    "valid JSON" cannot be assumed while scanning — a naive regex would
    happily rewrite `{"a":"x,}","b":1,}` into `{"a":"x}"...}`, silently
    corrupting the string instead of reporting the defect.

    Escape sequences inside strings (`\"`, `\\`) are honoured so an escaped
    quote does not end the string early.
    """
    out: list[str] = []
    in_string = False
    escape = False
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        if ch == ",":
            j = i + 1
            while j < n and text[j] in " \t\r\n":
                j += 1
            if j < n and text[j] in "}]":
                i += 1          # drop the comma, keep the whitespace
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def loads_lenient(raw: str | bytes) -> Any:
    """Parse JSON, tolerating trailing commas before `}` / `]`.

    Parameters
    ----------
    raw:
        The payload as received. `str` or `bytes` (both accepted, matching
        `json.loads`).

    Returns
    -------
    The decoded object.

    Raises
    ------
    ValueError
        If the payload is not valid JSON, even after removing trailing
        commas. The original strict-parse error is preserved so callers
        keep their existing error handling.
    """
    if isinstance(raw, (bytes, bytearray)):
        text = raw.decode("utf-8", "replace")
    else:
        text = raw
    try:
        return json.loads(text)
    except ValueError as first_error:
        repaired = strip_trailing_commas(text)
        if repaired == text:
            raise
        try:
            return json.loads(repaired)
        except ValueError:
            # Still broken: report the ORIGINAL strict error, which is the
            # more informative one (it points at the real defect).
            raise first_error
