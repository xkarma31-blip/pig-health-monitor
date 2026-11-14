#!/usr/bin/env python3
"""ESP32-S3 barn-mic ingest — TCP :9090 (firmware TCP_HOST/TCP_PORT).

CONTRACT (re-verified 2026-11-11 against the source that was actually
flashed to s3-mic-01 — always re-read it before trusting a constant):

  firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/esp32s3_telemetry.ino
    #define SAMPLE_RATE 48000                          (line 35)
    i2s_std: 16-bit, MONO, slot_mask LEFT              (i2s_install)
    monoBuf[i] = (int16_t)(rawBuffer[i] >> 16)        (L/R duplication REMOVED)
    tcp_enqueue((uint8_t *)monoBuf, samplesRead * 2)   <- lands here
    reconnects every 3 s                               (tcp_flush)

So the wire format is **S16LE MONO, 48 kHz, 96,000 B/s**. It used to be S16LE
*stereo* with the left channel duplicated into the right — twice the radio
airtime for exactly zero extra information, and more than this ESP's TCP
window can carry (CONFIG_LWIP_TCP_WND_DEFAULT = 5760 => ceiling is
window/RTT ~= 120 KB/s at the measured RTT).

This module still hands S16LE **stereo** to every consumer (to_pcm()), by
duplicating the mono samples on the Pi, where the CPU is free and the radio
airtime is not. The browser worklet, the cough classifier and the WAV recorder
therefore need no changes.

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

import numpy as np

import config
import pcm_downmix

ESP_PORT = 9090
ESP_RATE = int(getattr(config, "ESP_AUDIO_RATE", 48000))       # firmware: 48000
ESP_FORMAT = str(getattr(config, "ESP_AUDIO_FORMAT", "s16le")).lower()
ESP_CHANNELS = int(getattr(config, "ESP_AUDIO_CHANNELS", 2))   # firmware: 1 (mono)

# One sample-frame is:
#   s16le stereo (2 x 16 bit) -> 4 bytes
#   s16le mono   (1 x 16 bit) -> 2 bytes
#   s32le mono   (1 x 32 bit) -> 4 bytes
if ESP_FORMAT.startswith("s16"):
    FRAME_BYTES = 2 * ESP_CHANNELS
else:
    FRAME_BYTES = 4

NONZERO_WINDOW = 4        # ~4 s of chunks for the signal estimate
STALE_S = 3.0             # firmware pushes every few ms and reconnects in 3 s
# 20261111: how long the receiver tolerates total silence before declaring the
# socket dead. The RECEIVER is the only party that can know bytes stopped
# arriving: measured on the live board, the ESP's write() kept returning a
# full byte count for an entire dead session (txp=0 over thousands of
# messages), so the sender can never detect "my writes go nowhere". Closing
# the socket here sends the ESP a FIN, which its connect path handles.
ESP_SILENCE_CLOSE_S = 90.0   # tolerate long I2S stalls; the FIN resets the board socket


class _LevelAGC:
    """The level stage — ON THE PI.

    2026-11-11: this used to live in the ESP firmware. It moved here because
    levelling is post-processing and belongs on the machine with CPU to spare,
    not on the radio link. The ESP now sends the signal exactly as captured.

    Why it is needed at all: the raw barn mic arrives at about -46 dBFS RMS
    and -30 dBFS peak (measured on the real board). That is far too quiet to
    listen to or to classify. This lifts it to the target peak without ever
    letting it clip.

    Peak-targeting AGC: a smoothed peak envelope with a fast attack (so a
    squeal can never clip) and a slow release (so the level does not pump).
    """

    def __init__(self, target_dbfs: float = -3.0, max_gain: float = 64.0,
                 env_release: float = 0.85, gain_release: float = 0.05,
                 floor_dbfs: float = -30.0, hp_hz: float = 140.0,
                 floor_release: float = 0.9995) -> None:
        self.target = 10.0 ** (target_dbfs / 20.0)
        # The level the NOISE FLOOR is normalised to. An event then lands
        # (event level - floor level) dB above it, so its height above the
        # noise is preserved instead of being squashed by a peak-targeting AGC.
        self.target_floor = 10.0 ** (floor_dbfs / 20.0)
        self.max_gain = max_gain
        self.env_release = env_release
        self.gain_release = gain_release
        # The floor rises slowly and drops instantly: a fan that stops is
        # picked up at once, a louder fan is learned slowly.
        self.floor_release = floor_release
        self.gain = 1.0
        self.env = 0.0
        self.clipped = 0
        # Noise floor + last-chunk RMS, for an SNR readout.
        self.floor = 0.0
        self.last_rms = 0.0
        # One-pole high-pass state (the fan's low rumble is the loudest and
        # least useful part of the noise).
        self._hp_x1 = 0.0
        self._hp_y1 = 0.0
        self._hp_alpha = 0.0

    # Below this RMS the room is effectively silent and there is no noise
    # floor to normalise against (-70 dBFS in 16-bit units).
    _silence_rms = 10.0 ** (-70.0 / 20.0) * 32767.0

    def process(self, samples) -> bytes:
        """Level one chunk. Accepts an array('h') or raw bytes; returns bytes."""
        if isinstance(samples, (bytes, bytearray, memoryview)):
            if not len(samples):
                return b""
            a = np.frombuffer(bytes(samples), dtype=np.int16)
        else:
            if not len(samples):
                return b""
            a = np.frombuffer(samples, dtype=np.int16)
        if a.size == 0:
            return b""
        # --- 1. high-pass: drop the fan's low-frequency rumble -------------
        a = self._highpass(a)

        # --- 2. noise floor: a slow-decaying MINIMUM of the RMS envelope ---
        rms = float(np.sqrt(np.mean(np.square(a.astype(np.float64)))))
        self.last_rms = rms
        if self.floor <= 0.0:
            self.floor = rms
        elif rms < self.floor:
            self.floor = rms                       # instant attack (floor drops)
        else:
            self.floor = (self.floor * self.floor_release
                          + rms * (1.0 - self.floor_release))

        peak = int(np.max(np.abs(a.astype(np.int32))))
        if peak > self.env:
            self.env = float(peak)                   # instant attack
        else:
            self.env = self.env * self.env_release + peak * (1.0 - self.env_release)

        # --- 3. gain: normalise the FLOOR, not the peak -------------------
        # A barn has a constant fan, so the PEAK of the signal is the fan.
        # Levelling to the peak amplifies the fan and buries the cough. With
        # a real noise floor present, scale so the floor sits at a fixed level
        # and the event's height ABOVE the floor survives. In true silence
        # there is no floor, so fall back to peak targeting (the peak IS the
        # event then).
        if self.floor > self._silence_rms:
            desired = (32767.0 * self.target_floor) / self.floor
        elif self.env > 1.0:
            desired = (32767.0 * self.target) / self.env
        else:
            desired = self.max_gain

        # --- 4. never clip: the peak limiter is the hard ceiling ----------
        if peak > 0:
            desired = min(desired, (32767.0 * self.target) / peak)
        desired = min(max(desired, 1.0), self.max_gain)
        if desired < self.gain:
            self.gain = desired                       # fast attack
        else:
            self.gain += (desired - self.gain) * self.gain_release   # slow release
        g = self.gain
        out = np.clip(a.astype(np.float32) * g, -32768, 32767).astype(np.int16)
        self.clipped += int(np.count_nonzero(np.abs(out.astype(np.int32)) >= 32767))
        return out.tobytes()

    def gain_db(self) -> float:
        import math
        return 20.0 * math.log10(self.gain) if self.gain > 1e-6 else -120.0

    def noise_floor_db(self) -> float:
        """The tracked noise floor in dBFS (-120 when there is no signal)."""
        import math
        if self.floor <= 1e-6:
            return -120.0
        return 20.0 * math.log10(self.floor / 32767.0)

    def snr_db(self) -> float:
        """How far the last chunk rises ABOVE the noise floor, in dB.

        This is the number a classifier should gate on. In a barn with a
        constant fan an absolute amplitude threshold is meaningless (the fan
        alone is loud); a sound only counts as an event if it stands clear of
        the floor by enough dB.
        """
        import math
        if self.floor <= 1e-6 or self.last_rms <= 1e-6:
            return 0.0
        return 20.0 * math.log10(self.last_rms / self.floor)

    def _highpass(self, a):
        """One-pole high-pass. Removes the fan's rumble, keeps the speech band.

        y[n] = a * (y[n-1] + x[n] - x[n-1])

        The cutoff is the fan's own low end: a cough is broadband (roughly
        300 Hz and up), while a fan's energy sits below a couple of hundred
        hertz. Placed and aimed at the pen (see the field guidance), the
        directional mic plus this filter is the published answer to barn noise.
        """
        if self._hp_alpha <= 0.0:
            import config as _cfg
            rate = float(getattr(_cfg, "ESP_AUDIO_RATE", 48000) or 48000)
            fc = max(1.0, float(getattr(_cfg, "ESP_AUDIO_HP_HZ", 140.0) or 140.0))
            rc = 1.0 / (2.0 * 3.141592653589793 * fc)
            dt = 1.0 / rate
            self._hp_alpha = rc / (rc + dt)
        if a.size < 2:
            return a
        x = a.astype(np.float32)
        y = np.empty_like(x)
        xp = self._hp_x1
        yp = self._hp_y1
        al = self._hp_alpha
        # numpy cannot express a recursive IIR, so this is a tight loop; at
        # 48 kHz in 8 kB chunks it costs about 1 % of a core.
        for i in range(x.size):
            cur = al * (yp + x[i] - xp)
            xp = x[i]
            yp = cur
            y[i] = cur
        self._hp_x1 = float(xp)
        self._hp_y1 = float(yp)
        return y


_DEFAULT_AGC = None


def default_agc() -> "_LevelAGC":
    """The shared level stage for consumers that want the boosted signal."""
    global _DEFAULT_AGC
    if _DEFAULT_AGC is None:
        _DEFAULT_AGC = _LevelAGC(
            target_dbfs=float(getattr(config, "ESP_AUDIO_TARGET_DBFS", -3.0)),
            max_gain=float(getattr(config, "ESP_AUDIO_MAX_GAIN", 64.0)),
        )
    return _DEFAULT_AGC


class EspAudioIngest:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subs: set[tuple[str, queue.Queue]] = set()
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
        # The level stage and the resampler live HERE, not in the consumers:
        # they run once per chunk, in numpy, in the ingest's own thread.
        self._agc = default_agc()
        self._mixer = (pcm_downmix.Downmixer(ESP_RATE, 16000)
                       if ESP_RATE % 16000 == 0 else None)
        self._buf48 = b""
        self._buf16 = b""
        self._bufRaw48 = b""
        # Gap instrumentation. Two legs matter and they fail differently:
        #   _max_gap_in  : ESP -> Pi   (the radio / the ESP's own loop)
        #   _max_gap_out : Pi -> browser (the HTTP request thread)
        # One /esp/status call tells you which leg stalled.
        self._last_offer_ts = 0.0
        self._max_gap_in = 0.0
        self._max_gap_out = 0.0
        self._out_gap_since = 0.0


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
        last_rx = time.monotonic()
        try:
            conn.settimeout(1.0)
            # ACK every segment: the ESP32's window is small and delayed ACKs
            # inflate the RTT (measured 80 ms vs 3 ms min), starving the stream.
            if hasattr(socket, "TCP_QUICKACK"):
                try:
                    conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_QUICKACK, 1)
                except OSError:
                    pass
            while True:
                try:
                    chunk = conn.recv(8192)
                except socket.timeout:
                    # 20261111: NO HEARTBEAT ON THE AUDIO SOCKET.
                    #
                    # I added one (a byte every 2 s) so the ESP could detect a
                    # half-open socket. It was a serious mistake: the audio is
                    # 16-bit, so a ONE-byte heartbeat permanently shifts every
                    # sample after it. Measured on the live stream:
                    #
                    #   clean              : [100, -100,  200, -200]
                    #   with a heartbeat   : [100, -100, -14336, 14336]
                    #
                    # The whole stream was garbage - which is what the "peak at
                    # 32,700" measurements were: misaligned samples, not
                    # signal. This socket carries audio and NOTHING else.
                    #
                    # The half-open case is handled by this silence-close: the
                    # Pi closes a socket that has gone quiet, which sends the
                    # ESP a FIN, which its connect path already handles.
                    #
                    # The receiver is also the only side that can tell that
                    # bytes are not arriving: the ESP's write() keeps returning
                    # a full byte count even when the socket is wedged, so the
                    # sender can never detect "my writes go nowhere" alone.
                    if time.monotonic() - last_rx > ESP_SILENCE_CLOSE_S:
                        print(f"[esp-audio] no audio for {ESP_SILENCE_CLOSE_S:.0f}s "
                              f"- closing dead socket", flush=True)
                        break
                    continue
                if not chunk:
                    break
                last_rx = time.monotonic()
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
        """Decode one chunk from the ESP and fan out PREBUILT buffers.

        2026-11-11 - ARCHITECTURE. This used to do almost nothing: it passed
        the raw bytes to the subscribers and left every subscriber to decode,
        level and resample for itself, in the web server's REQUEST THREADS.

        That was wrong on two counts:
          * the work was repeated per subscriber (the browser AND the cough
            classifier each rebuilt the same stereo signal);
          * parts of it were pure Python (the mono->stereo upmix), so it ran
            under the GIL and could stall the OTHER request threads - which is
            how a CCTV snapshot request could end up pausing the audio.

        Now the ingest owns the whole format: it decodes once, applies the
        level stage once, and produces every output format once, all in numpy.
        A subscriber receives finished bytes; its thread only does
        q.get() and socket.write(). No decode, no resample, no Python loops,
        no GIL pressure - on the audio path.
        """
        raw = data[: len(data) - (len(data) % FRAME_BYTES)]
        if not raw:
            return
        now = time.monotonic()
        if self._last_offer_ts:
            gap = now - self._last_offer_ts
            if gap > self._max_gap_in:
                self._max_gap_in = gap
        self._last_offer_ts = now

        # --- decode: ESP mono S16LE -> numpy int16 -------------------------
        mono = np.frombuffer(raw, dtype=np.int16)
        if mono.size == 0:
            return
        nz = int(np.count_nonzero(mono))

        # --- the level stage, once ------------------------------------------
        lev_mono = self._agc.process(raw)             # bytes, mono, leveled

        # --- the output formats, once each ---------------------------------
        #
        # 2026-11-11: this work is done OUTSIDE self._lock on purpose. The
        # lock is also taken by status() - which the dashboard polls every
        # 700 ms - and by subscribe()/unsubscribe(). Holding it across numpy
        # work meant a status() call could wait behind a resample, and the
        # whole point of moving the work here was to keep the request threads
        # free.
        #
        # The resampler is a STREAMING filter (it keeps the filter tail and
        # the decimation phase across calls), so it must be fed in order -
        # which is exactly what happens here, once, in the ingest's own
        # thread, instead of once per subscriber.
        buf48 = _mono_to_stereo_bytes(lev_mono)          # leveled 48k stereo
        bufRaw48 = _mono_to_stereo_bytes(raw)           # raw 48k stereo
        buf16 = b""
        if self._mixer is not None:
            buf16 = _mono_to_stereo_bytes(self._mixer.process(buf48, channels=2))

        with self._lock:
            self._buf48 = buf48
            self._bufRaw48 = bufRaw48
            self._buf16 = buf16
            self._buf_ts = now
            self._bytes += len(data)
            self._chunks += 1
            self._nonzero += nz
            self._total_samples += int(mono.size)
            self._nz_chunks.append((nz, int(mono.size)))
            if len(self._nz_chunks) > NONZERO_WINDOW:
                self._nz_chunks.pop(0)
            self._last_data = now
            subs = list(self._subs)

        for fmt, q in subs:
            buf = {"48": self._buf48, "16": self._buf16,
                   "raw48": self._bufRaw48}.get(fmt, self._buf48)
            try:
                q.put_nowait(buf)
            except queue.Full:
                try:
                    q.get_nowait()          # drop oldest — stay live
                    q.put_nowait(buf)
                except (queue.Empty, queue.Full):
                    pass

    def note_out_gap(self, gap_s: float) -> None:
        """The web server reports how long its write loop went without a chunk."""
        with self._lock:
            if gap_s > self._max_gap_out:
                self._max_gap_out = gap_s

    def subscribe(self, fmt: str = "48") -> queue.Queue:
        """Subscribe to a PREBUILT format: "48" (leveled 48k stereo),
        "16" (leveled 16k stereo) or "raw48" (raw, for the cough classifier)."""
        q: queue.Queue = queue.Queue(maxsize=64)
        with self._lock:
            self._subs.add((fmt, q))
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            for item in list(self._subs):
                if item[1] is q:
                    self._subs.discard(item)

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
                "sourceChannels": ESP_CHANNELS,
                "frameBytes": FRAME_BYTES,
                "formats": ["48", "16", "raw48"],
                "subscribers": len(self._subs),
                "maxGapInMs": int(self._max_gap_in * 1000),
                "maxGapOutMs": int(self._max_gap_out * 1000),
                "bytes": self._bytes,
                "chunks": self._chunks,
                "lastMs": int(age * 1000) if age is not None else None,
                "nonzeroPct": round(100.0 * nz / tot, 1) if tot else 0.0,
                "signal": (nz > 0),
                "accepted": self._accepted,
                "uptimeS": int(now - self._started) if self._started else 0,
            }


_esp = EspAudioIngest()


def _mono_to_stereo_bytes(mono: bytes) -> bytes:
    """S16LE mono -> S16LE stereo, in numpy (no Python loop)."""
    if not mono:
        return b""
    a = np.frombuffer(mono, dtype=np.int16)
    out = np.empty(a.size * 2, dtype=np.int16)
    out[0::2] = a
    out[1::2] = a
    return out.tobytes()


def get() -> EspAudioIngest:
    return _esp


def ensure_started() -> None:
    _esp.ensure_started()


def to_pcm(chunk: bytes) -> bytes:
    """Normalize the ESP payload to S16LE stereo — the shape mic.js expects.

    20261111: the firmware now sends MONO (1 x 16 bit, 48 kHz, 96,000 B/s)
    instead of fake stereo. The duplication the old firmware used to do on the
    wire is done HERE instead, on the Pi, where CPU is free and the radio
    airtime is not. The bytes leaving this function are byte-for-byte the same
    shape as before, so the browser worklet, the cough classifier and the WAV
    recorder are all unaffected.

    s16le stereo (old firmware): pass through.
    s16le mono   (current)    : duplicate mono into both channels.
    s32le (raw-words build)   : 24-bit field sits in bits 31..8, so shift 16,
                                then duplicate mono to both channels.
    """
    chunk = chunk[: len(chunk) - (len(chunk) % FRAME_BYTES)]
    if not chunk:
        return b""
    if ESP_FORMAT.startswith("s16"):
        if ESP_CHANNELS == 2:
            return chunk
        mono = array("h")
        mono.frombytes(chunk)
        out = array("h", bytes(4 * len(mono)))        # zero-filled stereo
        out[0::2] = mono
        out[1::2] = mono
        return out.tobytes()
    words = array("i")
    words.frombytes(chunk)
    mono = array("h", (w >> 16 for w in words))   # 24-bit field -> 16-bit
    out = array("h", bytes(4 * len(mono)))        # zero-filled stereo
    out[0::2] = mono
    out[1::2] = mono
    return out.tobytes()
