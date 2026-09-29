#!/usr/bin/env python3
"""ESP32-S3 barn-mic ingest — TCP :9090 (firmware TCP_HOST/TCP_PORT).

CONTRACT (re-verified 2026-09-28 10:30 against the source that was actually
flashed to s3-mic-01 — always re-read it before trusting a constant):

  firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/esp32s3_telemetry.ino
    #define SAMPLE_RATE 48000                          (line 46)
    i2s_std: 16-bit, MONO, slot_mask LEFT              (lines 84-85)
    stereoBuf[i*2] = stereoBuf[i*2+1] = rawBuf[i]      (lines 239-240)
        ^ driver returns full 16-bit samples: no bit shifting anywhere
    tcp_send(stereoBuf, samplesRead * 4)               (line 242)  <- lands here
    reconnects every 3 s                               (line 134)

So the wire format today is **S16LE stereo, L/R duplicated, 48 kHz**, already
converted on the ESP — this module passes it straight through. Rate and format
are read from config (ESP_AUDIO_RATE / ESP_AUDIO_FORMAT) because that file is
still under active edit; if the firmware moves, change the config, not this.

`ESP_AUDIO_FORMAT = "s32le"` is kept for the older raw-words build: INMP441
data is MSB-aligned in the 32-bit slot, so we shift 16 and duplicate mono.

Health tracking exists because the Pi's own mic has a known all-zero wiring
fault — this makes each path's signal status obvious in one status call.
"""
from __future__ import annotations

import queue
import socket
import threading
import time
from array import array

import config

ESP_PORT = 9090
ESP_RATE = int(getattr(config, "ESP_AUDIO_RATE", 48000))       # firmware: 48000
ESP_FORMAT = str(getattr(config, "ESP_AUDIO_FORMAT", "s16le")).lower()
# one sample-frame is 4 bytes in BOTH supported shapes:
#   s16le stereo (2 x 16 bit)  and  s32le mono (1 x 32 bit)
FRAME_BYTES = 4
NONZERO_WINDOW = 4        # ~4 s of chunks for the signal estimate
STALE_S = 3.0             # firmware pushes every few ms and reconnects in 3 s


class EspAudioIngest:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subs: set[queue.Queue] = set()
        self._thread: threading.Thread | None = None
        self._conn: socket.socket | None = None   # the one live ESP socket
        self._peer = ""
        self._bytes = 0
        self._chunks = 0
        self._nonzero = 0
        self._total_samples = 0
        self._nz_chunks: list[tuple[int, int]] = []
        self._last_data = 0.0
        self._started = 0.0
        self._accepted = 0
        self._bind_error: str | None = None   # surfaced via /esp/status

    # ---------------- lifecycle ----------------
    def ensure_started(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._started = time.monotonic()   # must match status()'s clock
            self._thread = threading.Thread(
                target=self._serve, name="esp-audio-9090", daemon=True
            )
            self._thread.start()

    def _serve(self) -> None:
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            srv.bind(("0.0.0.0", ESP_PORT))
            srv.listen(4)
            print(f"[esp-audio] listening on 0.0.0.0:{ESP_PORT}", flush=True)
            with self._lock:
                self._bind_error = None
        except OSError as e:
            # Previously only logged then the thread died silently —
            # /esp/status kept claiming an idle (not failed) listener.
            msg = f"cannot bind 0.0.0.0:{ESP_PORT} — {e}"
            print(f"[esp-audio] FATAL {msg}", flush=True)
            with self._lock:
                self._bind_error = msg
            return
        while True:
            try:
                conn, addr = srv.accept()
            except OSError:
                time.sleep(1)
                continue
            with self._lock:
                self._accepted += 1
                old, self._conn = self._conn, conn   # single active ESP:
            if old is not None:                      # kick the stale socket so
                try:                                 # two clients never interleave
                    old.close()
                except OSError:
                    pass
            threading.Thread(
                target=self._handle, args=(conn, addr), daemon=True
            ).start()

    def _handle(self, conn: socket.socket, addr) -> None:
        print(f"[esp-audio] ESP connected from {addr[0]}", flush=True)
        with self._lock:
            self._peer = f"{addr[0]}:{addr[1]}"
        try:
            conn.settimeout(5.0)
            while True:
                try:
                    chunk = conn.recv(8192)
                except socket.timeout:
                    continue
                if not chunk:
                    break
                self._offer(chunk)
        except OSError:
            pass
        finally:
            try:
                conn.close()
            except OSError:
                pass
            with self._lock:
                if self._conn is conn:      # only clear if we are still the owner
                    self._conn = None
                    self._peer = ""
            print("[esp-audio] ESP disconnected", flush=True)

    # ---------------- fan-out ----------------
    def _offer(self, data: bytes) -> None:
        # signal estimate (cheap: only counts non-zero samples)
        samples = array("h" if ESP_FORMAT.startswith("s16") else "i")
        samples.frombytes(data[: len(data) - (len(data) % FRAME_BYTES)])
        nz = sum(1 for s in samples if s)
        now = time.monotonic()
        with self._lock:
            self._bytes += len(data)
            self._chunks += 1
            self._nonzero += nz
            self._total_samples += len(samples)
            self._nz_chunks.append((nz, len(samples)))
            if len(self._nz_chunks) > NONZERO_WINDOW:
                self._nz_chunks.pop(0)
            self._last_data = now
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(data)
            except queue.Full:
                try:
                    q.get_nowait()          # drop oldest — stay live
                    q.put_nowait(data)
                except (queue.Empty, queue.Full):
                    pass

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=64)
        with self._lock:
            self._subs.add(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            self._subs.discard(q)

    # ---------------- reporting ----------------
    def status(self) -> dict:
        now = time.monotonic()
        with self._lock:
            nz = sum(c[0] for c in self._nz_chunks)
            tot = sum(c[1] for c in self._nz_chunks)
            age = (now - self._last_data) if self._last_data else None
            # TCP can sit half-open after the ESP loses power — only report
            # "connected" while data is still moving (or just arrived).
            live_sock = self._conn is not None
            up = live_sock and (age is None or age <= STALE_S)
            return {
                "connected": bool(up),
                "socket": bool(live_sock),
                "stale": bool(live_sock and age is not None and age > STALE_S),
                "peer": self._peer,
                "bindError": self._bind_error,
                "port": ESP_PORT,
                "rate": ESP_RATE,
                "channels": 2,
                "format": "s16le",      # what /esp/stream emits after normalize
                "sourceFormat": ESP_FORMAT,   # what the ESP actually sends
                "bytes": self._bytes,
                "chunks": self._chunks,
                "lastMs": int(age * 1000) if age is not None else None,
                "nonzeroPct": round(100.0 * nz / tot, 1) if tot else 0.0,
                "signal": (nz > 0),
                "accepted": self._accepted,
                "uptimeS": int(now - self._started) if self._started else 0,
            }


_esp = EspAudioIngest()


def get() -> EspAudioIngest:
    return _esp


def ensure_started() -> None:
    _esp.ensure_started()


def to_pcm(chunk: bytes) -> bytes:
    """Normalize the ESP payload to S16LE stereo — the shape mic.js expects.

    s16le (current firmware): L/R already duplicated on the ESP -> pass through.
    s32le (raw-words build): 24-bit field sits in bits 31..8, so shift 16,
    then duplicate mono to both channels.
    """
    chunk = chunk[: len(chunk) - (len(chunk) % FRAME_BYTES)]
    if not chunk:
        return b""
    if ESP_FORMAT.startswith("s16"):
        return chunk
    words = array("i")
    words.frombytes(chunk)
    mono = array("h", (w >> 16 for w in words))   # 24-bit field -> 16-bit
    out = array("h", bytes(4 * len(mono)))        # zero-filled stereo
    out[0::2] = mono
    out[1::2] = mono
    return out.tobytes()
