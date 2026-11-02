# Track T3 — CCTV & Audio Processing

**Track note file** (worker-owned; T0 folds it into `CANON.md`).
**Scope:** `v3-mqtt-pocketbase/backend/cctv/**`, new `v3-mqtt-pocketbase/backend/processing/audio/**`
plus the `EnvironmentFile=` wiring in `v3-mqtt-pocketbase/backend/systemd/pigpulse-cctv.service`.
**Never touched:** firmware, mobile app, `backend/thermal-pi/**`, `CANON.md`.

---

## Track note 2026-11-03 — RTSP credentials moved out of the source; offline audio pipeline landed

### 1. What changed

| File | Change |
|---|---|
| `backend/cctv/tapo_mjpeg_server.py` | RTSP user/pass/host/port now come from `TAPO_RTSP_*` env vars. `require_rtsp_credentials()` **fails closed** (`SystemExit`) when they are unset. Added `--selftest`. |
| `backend/systemd/pigpulse-cctv.service` | Added `EnvironmentFile=-/etc/pigpulse/cctv.env` and `EnvironmentFile=-%h/.config/pigpulse/cctv.env`. |
| `backend/processing/audio/normalize.py` | **New.** Any audio source → one shared schema: 16 000 Hz, mono, s16le WAV. |
| `backend/processing/audio/extract_clips.py` | **New.** Adaptive VAD + cough heuristic → segment WAVs + a JSON clip index. |
| `~/.config/pigpulse/cctv.env` | **New, untracked, mode 0600.** Holds the camera credentials. |

**Credential handling.** The previous source line was:

```python
RTSP_USER, RTSP_PASS, RTSP_PORT = "<user>", "<passphrase>", 554   # redacted here on purpose
```

There are now **no defaults**. If `TAPO_RTSP_USER` / `TAPO_RTSP_PASS` are absent the
server exits with `CCTV: FATAL missing RTSP credentials: …` instead of silently
trying a published passphrase. `os.getenv(...)` call-form is used deliberately so
the AST credential guard in `backend/thermal-pi/admin_console.py` sees a
non-literal, not a string constant.

**Measured — AST credential guard:**

```
cctv/tapo_mjpeg_server.py              0 findings   (was 1)
bridge/local_bridge.py                 0
workers/cloud_sync.py                  0
workers/readonly_pb_proxy.py           0
thermal-pi/config.py                   0
thermal-pi/web_server.py               0
```

> The passphrase is still in git **history**. Removing it from the tree does not
> invalidate it — **rotate at the camera** (approved, scheduled). The value now
> in `~/.config/pigpulse/cctv.env` is the *current* one so the feed keeps
> working; the file carries a `ROTATION-PENDING` header.

### 2. Audio track verified (measured, not assumed)

`ffprobe` on the Tapo C200 SD-card corpus
(`backend/recordings/sdcard-archive-20261021/20260922_153358_tp00000.mp4`):

```json
{
  "codec": "pcm_alaw",
  "sample_rate": 8000,
  "channels": 1,
  "bits_per_sample": 8,
  "bit_rate": "64024",
  "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
  "duration_s": 268.399
}
```

**The camera does carry an audio track**, and it is **A-law 8 kHz mono**, not
AAC — which is why a generic AAC path would have produced silence.

### 3. The shared schema (why one format)

| Source | Native | After `normalize.py` |
|---|---|---|
| ESP32-S3 barn mic | 48 kHz, s16le, 2 ch (TCP :9090) | 16 kHz, mono, s16le WAV |
| Tapo C200 camera | A-law, 8 kHz, 1 ch (RTSP + SD MP4) | 16 kHz, mono, s16le WAV |

The classifier must not care which microphone produced a clip — only that the
format is identical. `ffmpeg` does the resampling and channel mixing (a
hand-rolled resampler would be slower *and* wrong). `numpy` is used only for
the VAD analysis. **No new dependencies.**

Measured on the real corpus:

```
source : pcm_alaw 8000 Hz 1 ch, 268.399 s
output : 16000 Hz, 1 ch, 119.998 s, 1 919 968 frames  (120 s in 0.13 s)
```

`normalize.py` accepts a container file, headerless raw PCM (`--raw-format
s16le --raw-rate 48000 --raw-channels 2`), or an `rtsp://` URL (TCP transport,
because the barn AP is lossy and UDP would drop frames the VAD reads as gaps).

### 4. VAD / cough extractor (thresholds)

| Knob | Value | Meaning |
|---|---|---|
| `FRAME_MS` | 20 | analysis frame |
| `NOISE_PERCENTILE` | 20 | frame dBFS percentile treated as background |
| `RISE_DB` | 8.0 | dB above the background a frame must sit |
| `MIN_DBFS` | −45.0 | absolute floor — silence never triggers VAD |
| `MIN_SEG_S` | 0.08 | shorter than this is a click, not an event |
| `MERGE_GAP_S` | 0.25 | gaps shorter than this do not split a segment |
| `COUGH_MAX_S` | 0.80 | a cough is short |
| `COUGH_CREST` | 2.0 | peak/rms — transience |
| `COUGH_RISE_DB` | 8.0 | loudness above the local background |
| `COUGH_HF_RATIO` | 0.10 | share of energy above 1 kHz (broadband) |
| `COUGH_SCORE_MIN` | 0.35 | weighted score floor |

Labels: `cough_candidate`, `noise_burst` (short, not transient enough),
`voice_like` (too long to be a cough).

### 5. Corpus measurement — 4 clips, 120 s each

| Source | duration | noise floor | VAD threshold | segments | cough candidates |
|---|---|---|---|---|---|
| `20260922_153358_tp00000` | 119.9 s | −42.7 dBFS | −34.7 dBFS | 55 | 5 |
| `20260923_134054_tp00001` | 119.9 s | −40.1 dBFS | −32.1 dBFS | 52 | 3 |
| `20260923_234828_tp00029` | 120.0 s | −44.2 dBFS | −36.2 dBFS | 60 | 1 |
| `20260930_024805_tp00059` | 120.0 s | −41.6 dBFS | −33.6 dBFS | 57 | 4 |

**480 s of barn audio → 224 segments → 13 cough candidates.**

- labels: `voice_like` 154, `noise_burst` 57, `cough_candidate` 13
- candidate duration: median **0.240 s**, range **0.120–0.740 s**
- candidate score: median **0.428**
- noise floors cluster at −40 … −44 dBFS (steady barn fan/vent hum)

> **These 13 are candidates, not verified coughs.** They are unlabelled
> heuristic hits and must be human-labelled before they become training data.
> The corpus is the deliverable, not a claim of cough detection.

### 6. Self-tests (all pass, no network, no device)

```
$ python3 backend/processing/audio/normalize.py   --selftest
normalize selftest OK (container + raw PCM -> 16000 Hz mono s16 WAV)

$ python3 backend/processing/audio/extract_clips.py --selftest
extract_clips selftest OK (quiet background -> 0 candidates, injected cough -> 1 at 1.0 s)

$ python3 backend/cctv/tapo_mjpeg_server.py --selftest
cctv selftest OK (credentials read from env, missing credentials fail closed)
```

The CCTV self-test runs in child processes because the module reads the
environment at import time.

**Bug found and fixed during the run:** `segment_features()` sliced its
"local background" out of the *segment* array instead of the full signal, so
`rise_db` was always 0 and the cough gate could never pass on real audio.
Now the background is the 0.5 s of the full signal immediately before the
segment. Verified on the synthetic burst: `rise_db` 25.18 dB (was 0).

### 7. Open items

| # | Item | State |
|---|---|---|
| T3-1 | **Live RTSP probe** — `normalize.py rtsp://… --duration 10` against the camera | **CLOSED 2026-11-03 06:02.** Live socket probed from the laptop (joined the PigPulse AP): `ffprobe` reports video `h264 1920x1080` + audio **`pcm_alaw 8000 Hz 1 ch 8-bit 64000 bps`** — byte-identical format to the offline SD corpus. A 12 s live capture normalized to `16000 Hz / 1 ch / pcm_s16le / 12.098 s / 193 568 frames`, and the VAD pass on it produced 5 segments (2 `cough_candidate`, 2 `noise_burst`, 1 `voice_like`). The live socket path is **proven**. |
| T3-2 | **Camera credential rotation** | Approved by Master, **pending**. Rotate at the camera, update `~/.config/pigpulse/cctv.env` (and `/etc/pigpulse/cctv.env` on the Pi), then the old passphrase is dead everywhere. |
| T3-3 | **Deploy the env file to the Pi** | `/etc/pigpulse/cctv.env` (root-owned, 0600) must be created on the Pi; the unit reads it via `EnvironmentFile=`. Blocked on the Pi being unreachable. |
| T3-4 | **Human labelling** of the 13 candidates | Needed before any classifier work. Physical labels are still an open item (canon #14). |
| T3-5 | **Cough classifier prototype** (Edge Impulse or PyTorch CPU) | **Not started — deliberately.** The track goal says the classifier trains on the collected clips; training on 13 unlabelled heuristic hits would be training on noise. Gated behind T3-4. |
| T3-6 | **Corpus timestamps are not trustworthy** | The SD filenames carry the *camera's* own clock, which is independently wrong (filenames say 2026-09-22 … 2026-09-30; the archive mtime says 2026-10-21 11:15). Treat the clip index's `start_s` as reliable (it is relative to the file) and the filename date as **unverified**. |
| T3-7 | **Laptop `/cctv` proxy has no feed** | `pigpulse-cctv.service` is inactive on the laptop and nothing listens on :8091, so the dashboard's `/cctv` route has no source. The CCTV server is a Pi-side component by design; the laptop copy is out of T3 scope. |

### 8. Reproduce

```bash
cd v3-mqtt-pocketbase/backend

# source facts
python3 processing/audio/normalize.py \
  recordings/sdcard-archive-20261021/20260922_153358_tp00000.mp4 --probe

# normalize -> shared schema
python3 processing/audio/normalize.py \
  recordings/sdcard-archive-20261021/20260922_153358_tp00000.mp4 \
  -o /tmp/clip1.16k.wav --duration 120

# segment + label
python3 processing/audio/extract_clips.py /tmp/clip1.16k.wav \
  --out-dir /tmp/clips --index /tmp/index.json
```

`backend/recordings/**` is gitignored (`.gitignore:65`) — the corpus stays on
disk, never in git.

### 9. Canon deltas for T0

- §5 SECRETS table: "Camera RTSP | `cctv/tapo_mjpeg_server.py` — still
  hard-coded, needs moving" is now **stale**. New state: credentials live in
  `EnvironmentFile=` (`/etc/pigpulse/cctv.env`, `~/.config/pigpulse/cctv.env`),
  the source has no defaults and fails closed, and the **rotation** is still
  outstanding.
- §6 OPEN ITEMS: "RTSP creds hard-coded (4)" → *code fixed; rotation pending*.
- New fact worth recording: the Tapo C200's audio track is **A-law 8 kHz
  mono** (`pcm_alaw`, 64 024 bps), and the camera's own clock is wrong —
  independent of the Pi clock problem.
- New fact worth recording: the shared audio schema for every downstream
  model is **16 kHz / mono / s16le WAV**.
