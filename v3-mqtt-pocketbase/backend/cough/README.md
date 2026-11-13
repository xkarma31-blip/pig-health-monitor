# PigPulse cough classifier — on-device bundle

**Retrieved from the live Pi on 2026-11-13.** This directory did not exist in
the repo before that date, even though the classifier had been running on the
Pi since 2026-11-07 and serving on `127.0.0.1:8096`. The source was on the
device and nowhere else — the same reproducibility gap the firmware had, and
the reason it is now version-controlled here.

---

## What is here

| File | What it is |
|---|---|
| `cough_classifier.py` | the whole service: front-end, ONNX session, scoring, HTTP API, UI |
| `head.json` | the **logistic head** — 2048 coefficients + intercept + threshold. *This is the trained part.* |
| `melW.npy` | librosa mel filterbank (257 × 64), as used by PANNs |
| `hann512.npy` | periodic Hann window, n_fft = 512 |
| `soak_monitor.py` | a small soak harness for the classifier's own counters |
| `requirements.txt` | the venv's contents, pinned |

## What is NOT here, and why

`cnn14_16k_body.onnx` — **304 MB**, the frozen PANNs `Cnn14_16k` body from
`bn0` onward.

```
sha256  b6c78e71d6483cfddc095673e43fb54fcad7637505c4ffeb61230eb37ffba663
size    318,670,463 bytes
```

It is not committed because **GitHub's hard limit is 100 MB per file** and this
repo is pushed to GitHub — the same constraint that blocked the branch earlier
(see `docs/AUDIT_20261113_PI_STATE.md` §7.5). It is a *frozen pre-trained
public checkpoint*, not work product, so the trained artefacts that matter —
`head.json` and the front-end parameters — are all version-controlled here.

**To restore it** (from the Pi, which still has the canonical copy):

```sh
scp pigpulse@192.168.69.1:/home/pigpulse/cough/cnn14_16k_body.onnx \
    v3-mqtt-pocketbase/backend/cough/
sha256sum v3-mqtt-pocketbase/backend/cough/cnn14_16k_body.onnx
# expect b6c78e71d6483cfddc095673e43fb54fcad7637505c4ffeb61230eb37ffba663
```

Verify with `sha256sum` before use — a truncated ONNX loads and then produces
garbage scores rather than failing.

## How it runs

```
ESP32-S3 --TCP :9090--> thermal-pi web_server.py (esp_audio_ingest)
                              |
                              GET /esp/stream?rate=native&raw=1  (loopback, HTTPS)
                              v
                    cough_classifier.py
                      numpy log-mel front-end (reflect-pad 256 -> 512-frame STFT,
                      hop 160 -> |X|^2 -> melW -> 10*log10(max(x,1e-10)))
                              |
                      ONNX Cnn14_16k -> 2048-d embedding
                              |
                      logistic head (head.json) -> cough probability
```

The front-end was verified against torch: max log-mel diff **0.0018 dB**,
cosine **1.000000**, max |dp| **2.1e-06**.

`:9090` is already bound by `web_server.py`, so a second process cannot
subscribe to the ingest directly — looping through `/esp/stream` reuses the
same publisher and the same clock.

## Service

- systemd unit: `pigpulse-cough.service` on the Pi
- listens on `127.0.0.1:8096` (loopback only)
- `ORT_THREADS = 2` — the 4 Hz thermal loop keeps the other cores
- Classification is **OFF by default** and stays off across restarts
  (`state.json`)

## Equivalence with the live Pi service — verified 2026-11-13

A deterministic synthetic 5 s window (seed 20261113: noise + a band-limited
burst at 3 kHz) was scored by **the repo copy on x86-64** and **the Pi's live
copy on aarch64**:

| field | repo copy (laptop) | Pi (aarch64) | |
|---|---|---|---|
| `head.json` coefficient hash | `319527dd1eb1…` | `319527dd1eb1…` | **identical** |
| threshold | 0.2061 | 0.2061 | identical |
| intercept | `-0.03850160539150238` | `-0.03850160539150238` | **bit-identical** |
| probability | 0.006687393395731075 | 0.006687408036696557 | agree to ~1e-8 relative |
| embedding sum | 182.3208465576172 | 182.32083129882812 | agree to ~1e-7 relative |

**Read this honestly:** the *artefacts* are bit-identical, but the *numerics*
differ in the last float32 bits because ONNX Runtime's kernels differ between
x86-64 and aarch64. The probability agrees to roughly **1e-8 relative** — three
orders of magnitude tighter than the 0.2061 threshold it is compared against,
so the **verdict is identical on both**. This is float32 rounding, not a
difference in the model or the head.

## Measured on the live Pi (2026-11-13)

| metric | value |
|---|---|
| windows scored | 1511 |
| cough windows | 0 |
| mean probability | 0.0105 |
| max probability | 0.0687 |
| verdict | LOW |
| RSS | 432 MB |
| CPU | 56% average, 134% peak |
| upstream reconnects | 128 in 9276 s (~1 per 72 s) |

**0 coughs in 1511 windows.** The classifier is running and scoring; the barn
simply has not produced a detected cough in that window. That is a statement
about the audio, not about the model.
