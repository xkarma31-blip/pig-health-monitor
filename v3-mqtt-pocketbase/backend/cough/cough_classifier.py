#!/usr/bin/env python3
"""cough_classifier.py — on-device cough inference for the PigPulse Pi.

Audio path (no new listening socket, the ESP ingest is untouched):

    ESP32-S3 --TCP :9090--> web_server.py  (esp_audio_ingest)
                            GET /esp/stream?rate=16000  (loopback, HTTPS)
      --> this process
          numpy log-mel  ->  ONNX PANNs Cnn14 body  ->  logistic head
      --> 127.0.0.1:8096
      --> proxied by web_server at https://<pi>:8080/cough

Why this shape
--------------
* :9090 is already bound by web_server, so a second process cannot subscribe to
  the ingest directly. Looping through /esp/stream reuses the same publisher and
  the same downmixer, so this process is on the same sample clock as the
  thermal frames (X-Stream-Ts).
* The Pi has no PyTorch (5 GB free disk). The frozen Cnn14 body runs on
  onnxruntime and the mel front-end is numpy. Parity against the training
  pipeline was measured before deployment, not assumed:
      log-mel max |diff| 0.0018 dB, embedding cosine 1.000000,
      cough probability max |diff| 2.1e-06, decisions identical.

Fail-safe
---------
Classification is OFF by default and stays off across restarts (state.json).
While off, audio is still read and discarded so the stream stays warm and the
buffer is never stale, but no inference runs and no window is recorded.
"""
from __future__ import annotations

import http.client
import json
import math
import os
import queue
import socket
import ssl
import subprocess
import sys
import threading
import time
import wave
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import numpy as np
import onnxruntime as ort

# The Pi's own streaming downmixer (48 kHz stereo -> 16 kHz mono, 127-tap
# Kaiser sinc). Reusing it means this process pulls the NATIVE stream, so the
# safety-critical web_server no longer spends CPU filtering for us.
sys.path.insert(0, "/home/pigpulse/thermal-pi")
try:
    import pcm_downmix                       # noqa: E402
except Exception as _e:                       # pragma: no cover
    pcm_downmix = None
    print(f"[cough] pcm_downmix unavailable ({_e}); falling back to upstream 16 kHz",
          flush=True)

from manual_session import ManualSession       # noqa: E402

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / "state.json"
# 20261120: durable audit trail. The in-RAM deque (maxlen 720) resets on every
# restart, so every scored window is also appended to a JSONL file, and any
# window above the clip threshold is written to a WAV file. This is what makes
# "which frame was classified" answerable after the fact.
WINDOWS_LOG = HERE / "windows.jsonl"
CLIPS_DIR = HERE / "clips"
CLIP_THRESHOLD = float(os.environ.get("COUGH_CLIP_THRESHOLD", "0.05"))
# 20261121: one cough alert per minute maximum. The thermal publisher latches
# per "sick pig"; here we latch per time window so a coughing pen produces a
# useful trickle, not 12 alerts a minute.
COUGH_ALERT_COOLDOWN_S = float(os.environ.get("COUGH_ALERT_COOLDOWN_S", "60"))
# Optional override so the alert path can be tested without waiting for a real
# cough above the model threshold. Leave unset in production.
ALERT_THRESHOLD_ENV = os.environ.get("COUGH_ALERT_THRESHOLD", "")

SR = 16000
WINDOW_S = 5.0
WINDOW_N = int(SR * WINDOW_S)          # 80 000 samples
AGG_WINDOW_S = 60.0
UPSTREAM_HOST = "127.0.0.1"
UPSTREAM_PORT = 8080
# Pull native 48 kHz when we can downmix locally, so web_server stays cheap.
# 20261111: &raw=1 asks the Pi for the UNBOOSTED stream.
#
# The classifier is calibrated on the raw barn mic (threshold 0.2061, F1-optimal
# on the aSwine holdout) and its score is NOT level-invariant. With the +32 dB
# level stage it went from a LOW verdict (mean_p 0.005) to HIGH (25% of windows
# over threshold) - false positives from a louder signal, not louder coughs.
UPSTREAM_PATH = ("/esp/stream?rate=native&raw=1" if pcm_downmix is not None
                 else "/esp/stream?rate=16000&raw=1")
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 8096
ORT_THREADS = int(os.environ.get("REC_ORT_THREADS", "2"))
# Measured on the Pi (2026-11-16, real 304 MB Cnn14_16k model, 4 cores):
#   intra_op 1 -> 2552.9 ms/window   2 -> 1346.1 ms   3 -> 958.2 ms   4 -> 890.2 ms
# Scaling is near-linear to 3 threads and then flattens (memory-bandwidth
# bound). The default stays at 2 because the 4 Hz thermal loop runs on the
# same 4 cores; raise it with REC_ORT_THREADS when the mic is the only load.
# Do NOT try to scale this with multiple processes: 2 processes x 2 threads
# measured 0.82 windows/s against 0.94 for one process x 3 threads - worse,
# and each process would load another 304 MB of weights.
# The ESP is a real-time 48 kHz source, so 80 000 samples must arrive in ~5 s
# of wall time. When the mic collapses it sends FEWER samples, not silence,
# so a slow-filling window is a window full of gaps and must be thrown away.
GAP_TOLERANCE = 1.25

# ---------------------------------------------------------------- model load
print("[cough] loading front-end + head", flush=True)
MELW = np.load(HERE / "melW.npy").astype(np.float64)          # (257, 64)
HANN = np.load(HERE / "hann512.npy").astype(np.float64)       # (512,)
HEAD = json.loads((HERE / "head.json").read_text())
COEF = np.asarray(HEAD["coef"], dtype=np.float64)
INTERCEPT = float(HEAD["intercept"])
THRESH = float(HEAD["threshold"])
META = HEAD["meta"]

_so = ort.SessionOptions()
_so.intra_op_num_threads = ORT_THREADS
_so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
_t0 = time.time()
SESS = ort.InferenceSession(str(HERE / "cnn14_16k_body.onnx"), _so,
                            providers=["CPUExecutionProvider"])
print(f"[cough] model ready in {time.time() - _t0:.1f}s "
      f"(threshold {THRESH}, {len(COEF)}-d)", flush=True)


def numpy_logmel(y: np.ndarray, n_fft: int = 512, hop: int = 160) -> np.ndarray:
    """torchlibrosa Spectrogram(power=2) + LogmelFilterBank(ref=1.0, amin=1e-10).

    center=True / pad_mode='reflect' pads n_fft//2 either side, so 5 s
    (80 000 samples) yields 1 + (80 512 - 512)//160 = 501 frames.
    """
    pad = n_fft // 2
    yp = np.pad(y.astype(np.float64), (pad, pad), mode="reflect")
    n_frames = 1 + (len(yp) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(n_frames)[:, None]
    frames = yp[idx] * HANN[None, :]
    spec = np.fft.rfft(frames, n=n_fft, axis=1)
    power = spec.real ** 2 + spec.imag ** 2
    return 10.0 * np.log10(np.maximum(power @ MELW, 1e-10))


def embed(window: np.ndarray) -> np.ndarray:
    lm = numpy_logmel(window)
    return SESS.run(["embedding"],
                    {"logmel": lm[None, None, :, :].astype(np.float32)})[0][0]


def cough_prob(e: np.ndarray) -> float:
    z = float(e.astype(np.float64) @ COEF + INTERCEPT)
    return 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, z))))


def db(x: float) -> float:
    return 20.0 * math.log10(max(x, 1e-9))


def save_clip(w: np.ndarray, rec: dict) -> str | None:
    """Write a 5 s mono 16 kHz WAV for a scored window.

    Returns the path relative to CLIPS_DIR, or None on failure. Never raises:
    a full disk must not take the classifier down.
    """
    try:
        day = time.strftime("%Y%m%d", time.localtime(rec["ts"]))
        d = CLIPS_DIR / day
        d.mkdir(parents=True, exist_ok=True)
        name = (f"{time.strftime('%H%M%S', time.localtime(rec['ts']))}"
                f"_p{rec['p']:.4f}.wav")
        path = d / name
        pcm = np.clip(w, -1.0, 1.0)
        pcm16 = (pcm * 32767.0).astype("<i2")
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            wf.writeframes(pcm16.tobytes())
        return str(path.relative_to(CLIPS_DIR))
    except Exception:
        return None


def capture_frame() -> str:
    """Best-effort CCTV snapshot as a data URL for the alert record.

    Same contract as the thermal publisher's `_capture_frame`: a missing camera
    never blocks an alert, and the frame is what the camera saw at the moment
    the cough was scored. Returns '' on any failure.
    """
    try:
        import base64
        import ssl
        import urllib.request

        ctx = ssl._create_unverified_context()
        url = os.environ.get(
            "PIGPULSE_CCTV_SNAPSHOT_URL",
            "https://127.0.0.1:8080/cctv?snapshot=1",
        )
        with urllib.request.urlopen(url, timeout=3, context=ctx) as resp:
            data = resp.read()
        if not data or not data.startswith(b"\xff\xd8"):
            return ""
        return "data:image/jpeg;base64," + base64.b64encode(data).decode()
    except Exception:
        return ""


# ------------------------------------------------------------------- state
class State:
    def __init__(self) -> None:
        self.lock = threading.RLock()   # reentrant: first version deadlocked itself
        self.started = time.time()
        self.enabled = False
        self.toggle_ts = 0.0
        self.windows: deque = deque(maxlen=720)     # ~1 h at one per 5 s
        self.audio_connected = False
        self.audio_bytes = 0
        self.audio_reconnects = 0
        self.last_chunk = 0.0
        self.buffered = 0
        self.upstream_error = ""
        self.infer_ms: deque = deque(maxlen=200)
        self.scored = 0
        self.manual = ManualSession()
        self.manual_lock = threading.RLock()
        self.last_cough_alert = 0.0
        self.skipped_disabled = 0
        self.skipped_busy = 0
        self.dropped_gappy = 0     # window thrown away: audio had gaps
        self.upstream_eofs = 0     # clean stream ends (server closes on 5 s idle)
        self._cpu_prev = self._cpu_now()
        self._cpu_prev_t = time.time()
        self.cpu_pct = 0.0
        self.cpu_pct_now = 0.0
        self.load_state()

    # ---- persistence: a restart must not silently re-enable the model ----
    def load_state(self) -> None:
        try:
            d = json.loads(STATE_FILE.read_text())
            self.enabled = bool(d.get("enabled", False))
            self.toggle_ts = float(d.get("ts", 0.0))
        except Exception:
            self.enabled = False

    def save_state(self) -> None:
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"enabled": self.enabled, "ts": self.toggle_ts}))
        tmp.replace(STATE_FILE)

    def set_enabled(self, on: bool) -> None:
        with self.lock:
            self.enabled = bool(on)
            self.toggle_ts = time.time()
        self.save_state()

    # ---- cheap self-instrumentation (the UI shows these, so they must be real)
    @staticmethod
    def _cpu_now() -> float:
        try:
            f = Path("/proc/self/stat").read_text().split()
            return (int(f[13]) + int(f[14])) / os.sysconf("SC_CLK_TCK")
        except Exception:
            return 0.0

    def sample_cpu(self) -> None:
        now, t = self._cpu_now(), time.time()
        # Lifetime average, not the delta since the last poll: the model bursts
        # for ~1.2 s every 5 s, so a 2 s sample lands outside a burst about half
        # the time and reports a meaningless 3 %.
        up = max(t - self.started, 1.0)
        self.cpu_pct = max(0.0, now / up * 100.0)
        dt = t - self._cpu_prev_t
        if dt > 0.2:
            self.cpu_pct_now = max(0.0, (now - self._cpu_prev) / dt * 100.0)
            self._cpu_prev, self._cpu_prev_t = now, t

    def rss_mb(self) -> float:
        try:
            for line in Path("/proc/self/status").read_text().splitlines():
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024.0
        except Exception:
            pass
        return 0.0


ST = State()
WORK: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=2)
STOP = threading.Event()


# ------------------------------------------------------------- audio reader
def audio_loop() -> None:
    backoff = 1.0
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    while not STOP.is_set():
        conn = None
        try:
            conn = http.client.HTTPSConnection(UPSTREAM_HOST, UPSTREAM_PORT,
                                               timeout=20, context=ctx)
            conn.request("GET", UPSTREAM_PATH)
            r = conn.getresponse()
            if r.status != 200:
                raise RuntimeError(f"upstream HTTP {r.status}")
            with ST.lock:
                ST.audio_connected = True
                ST.upstream_error = ""
            backoff = 1.0
            acc = np.zeros(0, dtype=np.float32)
            acc_t0 = 0.0
            mixer = (pcm_downmix.Downmixer(48000, SR)
                     if pcm_downmix is not None else None)
            while not STOP.is_set():
                buf = r.read(8192)
                if not buf:
                    with ST.lock:
                        ST.upstream_eofs += 1
                    break
                if mixer is not None:
                    buf = mixer.process(buf, channels=2)   # -> s16le mono 16 kHz
                    if not buf:
                        continue
                x = np.frombuffer(buf, dtype="<i2").astype(np.float32) / 32768.0
                if acc.size == 0:
                    acc_t0 = time.time()
                    acc = x
                else:
                    acc = np.concatenate([acc, x])
                with ST.lock:
                    ST.audio_bytes += len(buf)
                    ST.last_chunk = time.time()
                    ST.buffered = acc.size / SR
                    enabled = ST.enabled
                while acc.size >= WINDOW_N:
                    span = time.time() - acc_t0
                    w = acc[:WINDOW_N].copy()
                    acc = acc[WINDOW_N:]
                    acc_t0 = time.time()
                    if span > WINDOW_S * GAP_TOLERANCE:
                        # 5 s of audio that took far longer than 5 s to arrive:
                        # the source dropped samples, so this window has holes.
                        with ST.lock:
                            ST.dropped_gappy += 1
                        continue
                    if not enabled:
                        with ST.lock:
                            ST.skipped_disabled += 1
                        continue
                    try:
                        WORK.put_nowait(w)
                    except queue.Full:
                        with ST.lock:
                            ST.skipped_busy += 1
                        try:                      # stay live: drop the oldest
                            WORK.get_nowait()
                            WORK.put_nowait(w)
                        except queue.Empty:
                            pass
        except Exception as e:                        # noqa: BLE001
            with ST.lock:
                ST.audio_connected = False
                ST.upstream_error = f"{type(e).__name__}: {e}"
                ST.audio_reconnects += 1
            time.sleep(backoff)
            backoff = min(backoff * 1.6, 10.0)
        finally:
            try:
                if conn:
                    conn.close()
            except Exception:
                pass


# ------------------------------------------------------------------ scorer
def scorer_loop() -> None:
    while not STOP.is_set():
        try:
            w = WORK.get(timeout=0.5)
        except queue.Empty:
            continue
        with ST.lock:
            if not ST.enabled:            # toggled off while queued
                ST.skipped_disabled += 1
                continue
            ts = time.time()

        t0 = time.perf_counter()
        e = embed(w)
        p = cough_prob(e)
        ms = (time.perf_counter() - t0) * 1000.0

        rms = float(np.sqrt(np.mean(w * w)))
        rec = {
            "ts": ts,
            "iso": time.strftime("%H:%M:%S", time.localtime(ts)),
            "p": round(p, 6),
            "above": bool(p >= THRESH),
            "dbfs": round(db(rms), 2),
            "peak_dbfs": round(db(float(np.max(np.abs(w)))), 2),
            "infer_ms": round(ms, 1),
            "emb_norm": round(float(np.linalg.norm(e)), 3),
        }
        # Durable audit: one JSON line per scored window, even if the process
        # restarts a minute later. Append-only; the scorer is the only writer.
        if p >= CLIP_THRESHOLD:
            clip = save_clip(w, rec)
            if clip:
                rec["clip"] = clip
        try:
            with WINDOWS_LOG.open("a") as f:
                f.write(json.dumps(rec, separators=(",", ":")) + "\n")
        except Exception:
            pass
        # Cough alert: same MQTT alerts topic as thermal, so the bridge writes
        # it to PocketBase → cloud sync → app. Throttled to one per minute.
        try:
            alert_threshold = (float(ALERT_THRESHOLD_ENV)
                               if ALERT_THRESHOLD_ENV else THRESH)
        except ValueError:
            alert_threshold = THRESH
        if p >= alert_threshold:
            now_a = time.time()
            with ST.lock:
                due = now_a - ST.last_cough_alert >= COUGH_ALERT_COOLDOWN_S
                if due:
                    ST.last_cough_alert = now_a
            if due:
                msg = (f"Cough window p={p:.4f} >= {alert_threshold:.4f} at "
                       f"{time.strftime('%H:%M:%S', time.localtime(ts))}")
                if rec.get("clip"):
                    msg += f" · clip {rec['clip']}"
                alert = {
                    "type": "COUGH",
                    "deviceId": "s3-mic-01",
                    "severity": "warning",
                    "message": msg,
                    "ts": int(ts * 1000),
                    "p": round(p, 6),
                }
                # Attach the CCTV frame at the moment of the alert, same as the
                # thermal publisher does. Best-effort: a missing camera never
                # blocks the alert, but the app needs the frame to show what was
                # happening when the cough was scored. This is the "frame" field
                # the app's AlertDetail already knows how to render.
                frame = capture_frame()
                if frame:
                    alert["frame"] = frame
                try:
                    subprocess.run(
                        ["mosquitto_pub", "-h", "127.0.0.1", "-t",
                         "pig/s3-mic-01/alerts", "-m", json.dumps(alert)],
                        timeout=5, check=False,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
        with ST.lock:
            ST.windows.append(rec)
            ST.scored += 1
            ST.infer_ms.append(ms)


# ------------------------------------------------------------- aggregation
VERDICT_BANDS = (
    (0.00, "QUIET",    "no window in the last 60 s crossed the threshold"),
    (0.05, "LOW",      "under 5 % of windows crossed the threshold"),
    (0.20, "ELEVATED", "5-20 % of windows crossed the threshold"),
    (1.01, "HIGH",     "over 20 % of windows crossed the threshold"),
)


def aggregate() -> dict:
    now = time.time()
    with ST.lock:
        recent = [w for w in ST.windows if now - w["ts"] <= AGG_WINDOW_S]
        ms = list(ST.infer_ms)
    if not recent:
        return {"window_s": AGG_WINDOW_S, "windows": 0, "cough_windows": 0,
                "rate_pct": None, "mean_p": None, "max_p": None,
                "verdict": "NO DATA", "why": "no scored window in the last 60 s"}
    pos = sum(1 for w in recent if w["above"])
    rate = pos / len(recent)
    verdict, why = VERDICT_BANDS[-1][1], VERDICT_BANDS[-1][2]
    for edge, name, text in VERDICT_BANDS:
        if rate < edge:
            verdict, why = name, text
            break
    if not ST.enabled:
        # A stale verdict must never look live: say plainly that the window is
        # ageing out because nobody is scoring any more.
        why = why + " (classification is off; this 60 s window is ageing out)"
    ms_sorted = sorted(ms)
    return {
        "window_s": AGG_WINDOW_S,
        "windows": len(recent),
        "cough_windows": pos,
        "rate_pct": round(100.0 * rate, 1),
        "mean_p": round(float(np.mean([w["p"] for w in recent])), 4),
        "max_p": round(max(w["p"] for w in recent), 4),
        "verdict": verdict,
        "why": why,
        "infer_ms_median": round(ms_sorted[len(ms_sorted) // 2], 1) if ms_sorted else None,
        "infer_ms_p95": round(ms_sorted[min(len(ms_sorted) - 1, int(0.95 * len(ms_sorted)))], 1) if ms_sorted else None,
    }


def status() -> dict:
    ST.sample_cpu()
    # aggregate() takes the lock itself, so it must be called OUTSIDE any
    # `with ST.lock:` block — this caught a real self-deadlock on the first
    # request, because threading.Lock is not reentrant.
    agg = aggregate()
    with ST.manual_lock:
        manual = ST.manual.status()
    with ST.lock:
        return {
            "ok": True,
            "server_ts": time.time(),
            "uptime_s": round(time.time() - ST.started, 1),
            "enabled": ST.enabled,
            "toggle_changed_ts": ST.toggle_ts,
            "audio": {
                "connected": ST.audio_connected,
                "upstream": f"{UPSTREAM_HOST}:{UPSTREAM_PORT}{UPSTREAM_PATH}",
                "downmix_on_pi": pcm_downmix is not None,
                "rate": SR, "channels": 1,
                "bytes": ST.audio_bytes,
                "reconnects": ST.audio_reconnects,
                "last_chunk_age_s": round(time.time() - ST.last_chunk, 2) if ST.last_chunk else None,
                "buffered_s": round(ST.buffered, 2),
                "error": ST.upstream_error,
            },
            "runtime": {
                "windows_scored": ST.scored,
                "skipped_disabled": ST.skipped_disabled,
                "skipped_busy": ST.skipped_busy,
                "dropped_gappy": ST.dropped_gappy,
                "upstream_eofs": ST.upstream_eofs,
                "rss_mb": round(ST.rss_mb(), 1),
                "cpu_pct": round(ST.cpu_pct, 1),
                "cpu_pct_now": round(ST.cpu_pct_now, 1),
                "ort_threads": ORT_THREADS,
            },
            "aggregate": agg,
            "manual": manual,
            "active_result_source": (
                "live" if agg.get("windows", 0) > 0
                else "manual" if manual.get("last") is not None
                else "none"
            ),
            "windows": list(ST.windows)[-60:][::-1],
            "model": {
                "name": "PANNs Cnn14_16k (frozen) + logistic head",
                "window_s": WINDOW_S,
                "frame_count": 501,
                "embedding_dim": int(len(COEF)),
                "threshold": THRESH,
                "threshold_note": "F1-optimal on the aSwine holdout (same farm)",
                "roc_auc_same_farm": META.get("roc_aswine"),
                "pr_auc_same_farm": META.get("pr_aswine"),
                "roc_auc_cross_species": META.get("roc_mapda"),
                "pr_auc_cross_species": META.get("pr_mapda"),
                "trained_on": META.get("trained_on"),
                "train_set": META.get("train"),
                "created": META.get("created"),
                "runtime": "onnxruntime CPU, numpy log-mel front-end",
                "parity": "log-mel 0.0018 dB, cosine 1.000000, max |dp| 2.1e-06 vs torch",
            },
        }


# --------------------------------------------------------------------- HTTP
PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,">
<title>PigPulse - Cough Classifier</title>
<style>
 :root{--bg:#1a1a2e;--card:#252545;--card2:#2e2e55;--text:#f2f6ff;--dim:#b9c6e6;
       --cyan:#5eead4;--teal:#2dd4bf;--amber:#fbbf24;--red:#f87171;--green:#4ade80}
 *{box-sizing:border-box}
 body{margin:0;padding:20px;background:var(--bg);color:var(--text);
      font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
 h1{font-size:26px;margin:0 0 4px;letter-spacing:.3px}
 h2{font-size:20px;margin:0 0 10px;color:var(--cyan)}
 .sub{color:var(--dim);font-size:15px;margin-bottom:18px}
 .card{background:var(--card);border:1px solid #3a3a66;border-radius:12px;
       padding:18px;margin-bottom:16px}
 .row{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
 .k{color:var(--dim);font-size:13px;text-transform:uppercase;letter-spacing:.6px}
 .v{font-size:22px;font-weight:700;margin-top:2px}
 .pill{display:inline-block;padding:5px 13px;border-radius:999px;font-weight:700;
       font-size:14px;letter-spacing:.4px}
 .on{background:#065f46;color:#6ee7b7;border:1px solid #10b981}
 .off{background:#4c1d24;color:#fca5a5;border:1px solid #b91c1c}
 button{cursor:pointer;border:0;border-radius:10px;padding:14px 26px;font-size:18px;
        font-weight:700;font-family:inherit}
 .btn-on{background:var(--teal);color:#062b26}
 .btn-off{background:#7f1d1d;color:#ffe4e6}
 table{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
 th,td{padding:7px 9px;text-align:right;border-bottom:1px solid #34345c}
 th{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.5px;text-align:right}
 td:first-child,th:first-child{text-align:left}
 tr.hit td{background:#3b2a12;color:#fde68a;font-weight:700}
 .big{font-size:40px;font-weight:800;letter-spacing:1px}
 .q{background:#232347;border-left:4px solid var(--amber);padding:12px 16px;
    border-radius:0 8px 8px 0;color:#e8eefc;font-size:16px}
 a{color:var(--cyan)}
 .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px}
</style></head><body>
<h1>PigPulse &mdash; Cough Classifier <span class="pill off" id="statePill">OFF</span></h1>
<div class="sub">On-device acoustic inference &middot; barn mic &rarr; this Pi &rarr; nothing leaves the device</div>

<div class="card"><div class="row" style="justify-content:space-between">
  <div><div class="k">Classification</div>
       <div class="v" id="toggleLabel">DISABLED (fail-safe default)</div></div>
  <button id="toggleBtn" class="btn-on">Enable classification</button>
</div></div>

<div class="card"><h2>Verdict &mdash; last 60 seconds</h2>
  <div class="row" style="justify-content:space-between">
    <div><div class="big" id="verdict">NO DATA</div>
         <div class="sub" style="margin:6px 0 0" id="why"></div></div>
    <div class="grid" style="flex:1;max-width:620px">
      <div><div class="k">Windows</div><div class="v" id="aggWin">-</div></div>
      <div><div class="k">Over threshold</div><div class="v" id="aggPos">-</div></div>
      <div><div class="k">Rate</div><div class="v" id="aggRate">-</div></div>
      <div><div class="k">Mean p</div><div class="v" id="aggMean">-</div></div>
    </div>
  </div>
</div>

<div class="card"><h2>Runtime</h2><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(132px,1fr))">
  <div><div class="k">Audio</div><div class="v" id="aud">-</div></div>
  <div><div class="k">Windows scored</div><div class="v" id="scored">-</div></div>
  <div><div class="k">Inference</div><div class="v" id="lat">-</div></div>
  <div><div class="k">Model CPU</div><div class="v" id="cpu">-</div></div>
  <div><div class="k">Memory</div><div class="v" id="rss">-</div></div>
  <div><div class="k">Uptime</div><div class="v" id="up">-</div></div>
  <div><div class="k">Gappy windows dropped</div><div class="v" id="gaps">-</div></div>
  <div><div class="k">Stream re-opens</div><div class="v" id="eofs">-</div></div>
</div>
<div class="sub" id="gapNote" style="margin:12px 0 0"></div></div>

<div class="card"><h2>Every window, full detail</h2>
<div style="max-height:430px;overflow:auto">
<table><thead><tr><th>Time</th><th>p(cough)</th><th>&ge;thr</th><th>dBFS</th>
<th>Peak dBFS</th><th>Infer ms</th><th>|emb|</th></tr></thead>
<tbody id="rows"><tr><td colspan="7" style="text-align:left;color:#b9c6e6">
No window scored yet. Enable classification above.</td></tr></tbody></table></div></div>

<div class="card"><h2>What this model is &mdash; and is not</h2>
  <div class="q" id="modelNote">loading&hellip;</div>
  <div class="grid" style="margin-top:16px" id="modelGrid"></div>
</div>

<script>
const BASE = location.pathname.replace(/\/+$/,'').endsWith('/cough') ? '/cough' : '';
const $ = id => document.getElementById(id);
let enabled = null;

function fmtPct(v){ return v===null||v===undefined ? '-' : v.toFixed(1)+' %'; }
function fmt(v,suf){ return v===null||v===undefined ? '-' : v+suf; }

async function toggle(){
  const next = !enabled;
  $('toggleBtn').disabled = true;
  try{
    const r = await fetch(BASE + '/api/toggle', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({enabled: next})});
    const j = await r.json();
    enabled = j.enabled;
  }catch(e){ console.error(e); }
  $('toggleBtn').disabled = false;
  refresh();
}

$('toggleBtn').onclick = toggle;

function render(s){
  enabled = s.enabled;
  $('statePill').textContent = s.enabled ? 'LIVE' : 'OFF';
  $('statePill').className = 'pill ' + (s.enabled ? 'on' : 'off');
  $('toggleLabel').textContent = s.enabled
      ? 'ENABLED - scoring every 5 s window' : 'DISABLED (fail-safe default)';
  $('toggleBtn').textContent = s.enabled ? 'Disable classification' : 'Enable classification';
  $('toggleBtn').className = s.enabled ? 'btn-off' : 'btn-on';

  const a = s.aggregate;
  $('verdict').textContent = a.verdict;
  $('verdict').style.color = a.verdict==='HIGH' ? 'var(--red)'
      : a.verdict==='ELEVATED' ? 'var(--amber)'
      : a.verdict==='LOW' ? 'var(--green)' : 'var(--cyan)';
  $('why').textContent = a.why || '';
  $('aggWin').textContent = a.windows;
  $('aggPos').textContent = a.cough_windows;
  $('aggRate').textContent = fmtPct(a.rate_pct);
  $('aggMean').textContent = fmt(a.mean_p,'');

  const au = s.audio;
  $('aud').textContent = au.connected ? 'streaming' : 'no stream';
  $('aud').style.color = au.connected ? 'var(--green)' : 'var(--red)';
  $('scored').textContent = s.runtime.windows_scored;
  $('lat').textContent = a.infer_ms_median===undefined||a.infer_ms_median===null
      ? '-' : a.infer_ms_median+' ms';
  $('cpu').textContent = s.runtime.cpu_pct.toFixed(1)+' %';
  $('rss').textContent = s.runtime.rss_mb.toFixed(0)+' MB';
  $('up').textContent = Math.round(s.uptime_s/60)+' min';
  $('gaps').textContent = s.runtime.dropped_gappy;
  $('gaps').style.color = s.runtime.dropped_gappy > 0 ? 'var(--amber)' : 'var(--green)';
  $('eofs').textContent = s.runtime.upstream_eofs;
  $('gapNote').textContent = s.runtime.dropped_gappy > 0
      ? 'Gappy windows are discarded, not scored: when the mic collapses it sends fewer '
        + 'samples rather than silence, so 5 s of audio that took longer than 6.25 s to '
        + 'arrive is full of holes and would be classified as a time-compressed fiction.'
      : 'Every scored window really was 5 s of continuous audio. Nothing has been discarded for gaps.';

  const m = s.model;
  $('modelNote').innerHTML =
    '<b>It ranks, it does not detect.</b> At the operating threshold it reaches '+
    'precision <b>0.41</b> and recall <b>0.50</b> per 5 s window &mdash; that is '+
    'roughly one false alarm per true cough, so a single window is <b>never</b> a '+
    'diagnosis. Read the 60 s verdict instead. Cross-species ROC '+
    (m.roc_auc_cross_species||'-')+' is '+(m.roc_auc_cross_species>0.8?'good':'weak')+
    ', but the labels come from one farm and the cough labels are weak.';
  $('modelGrid').innerHTML = [
    ['Checkpoint','Cnn14_16k mAP 0.438 (AudioSet)'],
    ['Window', m.window_s+' s / '+m.frame_count+' frames'],
    ['Embedding', m.embedding_dim+' dimensions and frozen'],
    ['Threshold', m.threshold.toFixed(4)],
    ['ROC-AUC same farm', m.roc_auc_same_farm],
    ['PR-AUC same farm', m.pr_auc_same_farm],
    ['ROC-AUC cross-species', m.roc_auc_cross_species],
    ['Runtime', m.runtime],
  ].map(([k,v])=>'<div><div class="k">'+k+'</div><div class="mono">'+v+'</div></div>').join('');

  const rows = s.windows || [];
  if(!rows.length){
    $('rows').innerHTML = '<tr><td colspan="7" style="text-align:left;color:#b9c6e6">'+
      (s.enabled ? 'Waiting for the first 5 s window...'
                 : 'Classification is off. Enable it above to score windows.')+'</td></tr>';
  } else {
    $('rows').innerHTML = rows.map(w =>
      '<tr class="'+(w.above?'hit':'')+'"><td>'+w.iso+'</td><td>'+w.p.toFixed(4)+
      '</td><td>'+(w.above?'YES':'no')+'</td><td>'+w.dbfs+
      '</td><td>'+w.peak_dbfs+'</td><td>'+w.infer_ms+'</td><td>'+w.emb_norm+
      '</td></tr>').join('');
  }
}

async function refresh(){
  try{
    const r = await fetch(BASE + '/api/status', {cache:'no-store'});
    render(await r.json());
  }catch(e){
    $('statePill').textContent='NO LINK';
    $('statePill').className='pill off';
  }
}
refresh();
setInterval(refresh, 2000);
</script></body></html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "PigPulseCough/1.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, "application/json", json.dumps(obj).encode())

    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/", "/cough", "/index.html"):
            self._send(200, "text/html; charset=utf-8", PAGE.encode())
        elif path == "/api/status":
            self._json(200, status())
        elif path == "/api/health":
            self._json(200, {"ok": True, "ts": time.time()})
        elif path == "/api/windows":
            with ST.lock:
                self._json(200, {"windows": list(ST.windows)[-200:][::-1]})
        elif path == "/api/clips":
            limit = 50
            try:
                qs = parse_qs(urlparse(self.path).query)
                limit = max(1, min(200, int(qs.get("limit", ["50"])[0])))
            except Exception:
                pass
            clips = []
            if CLIPS_DIR.exists():
                files = sorted(CLIPS_DIR.rglob("*.wav"),
                               key=lambda x: x.stat().st_mtime, reverse=True)
                for p in files[:limit]:
                    try:
                        clips.append({"file": str(p.relative_to(CLIPS_DIR)),
                                      "size": p.stat().st_size,
                                      "mtime": p.stat().st_mtime})
                    except OSError:
                        continue
            self._json(200, {"clips": clips, "threshold": CLIP_THRESHOLD})
        elif path == "/api/clip":
            qs = parse_qs(urlparse(self.path).query)
            name = (qs.get("file") or [""])[0]
            root = CLIPS_DIR.resolve()
            p = (CLIPS_DIR / name).resolve()
            if not str(p).startswith(str(root)) or not p.is_file():
                self._json(404, {"ok": False, "error": "not found"})
                return
            self._send(200, "audio/wav", p.read_bytes())
            return
        elif path == "/robots.txt":
            self._send(200, "text/plain", b"User-agent: *\nDisallow:\n")
        else:
            self._json(404, {"ok": False, "error": "not found", "path": path})

    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path != "/api/toggle":
            self._json(404, {"ok": False, "error": "not found", "path": path})
            return
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            want = bool(json.loads(raw.decode() or "{}").get("enabled"))
        except Exception as e:  # noqa: BLE001
            self._json(400, {"ok": False, "error": f"bad json: {e}"})
            return
        ST.set_enabled(want)
        print(f"[cough] classification {'ENABLED' if want else 'disabled'}", flush=True)
        self._json(200, {"ok": True, "enabled": ST.enabled, "ts": ST.toggle_ts})


def main() -> int:
    threading.Thread(target=audio_loop, name="audio", daemon=True).start()
    threading.Thread(target=scorer_loop, name="scorer", daemon=True).start()
    srv = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    srv.daemon_threads = True
    print(f"[cough] listening on http://{LISTEN_HOST}:{LISTEN_PORT} "
          f"(enabled={ST.enabled})", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        STOP.set()
        srv.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
