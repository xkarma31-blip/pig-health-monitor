# PigPulse — Canon, Part 1: Identity, Scope, Hardware

**Version 2.0 (corrected) — 2026-11-02**
**This file supersedes every memory entry and project document dated before 2026-11-02.**

> Authority: this canon wins over any contradicting document, briefing, memory
> entry, or earlier chat. The repo's own `CANON.md` remains authoritative for
> repository mechanics; where this file and `CANON.md` disagree on a *number*,
> **this file wins** (it carries the 2026-11-02 corrections).

## Provenance tags used throughout

| Tag | Meaning |
|---|---|
| `[MEASURED]` | read off the physical device |
| `[DATASHEET]` | vendor specification — NOT device-verified |
| `[PAPER]` | peer-reviewed literature |
| `[VERIFIED]` | arithmetic reproduced from first principles |
| `[OPEN]` | unresolved, or documents conflict |
| `[CORRECTED]` | changed from an earlier project document on 2026-11-02 |

**Rule:** only `[MEASURED]` may be called "confirmed". A spec-sheet value is never
"confirmed". Zeros on an audio capture mean the line is not being driven — not a
quiet room.

---

## 1. What the project is

**PigPulse** — a multi-modal pig-health monitoring system for smallholder/backyard
swine housing in the Philippines.

**Purpose hierarchy (locked):**
- **Primary:** the **research capstone**. This drives the plan.
- **Derived, not driving:** Embedded Systems Software Design and CPE Practice &
  Design are *related aspects* that consume artifacts from the research. Their
  full syllabi are NOT to be followed as if they set the agenda.

**Objective:** whole-pen (group) monitoring. "This pen needs attention" is the
primary alert. Individual-pig attribution is conditional on image quality
supporting it — never assumed.

## 2. Scope — LOCKED

**In scope:**
- Edge **cough detection** — audio CNN (supervised, labelled cough/noise), INT8
  quantised, targeting the ESP32-S3.
- **Thermal fever screening** at **zone/pen level** — rule-based thresholding
  (no ML).
- **Noise calibration** — unsupervised band-wise statistics matching on ambient
  audio (no training).
- Sensor **fusion as a research direction**, with honest treatment of what is and
  is not achievable.

**Explicitly OUT of scope (delimitations — state these as chosen limits):**
- Individual pig identification via CCTV.
- NH₃ / CO₂ gas sensing.
- Citric-acid challenge methodology.

## 3. Hardware — LOCKED

| Component | Role | Grounding |
|---|---|---|
| **Raspberry Pi 4 Model B Rev 1.2** | edge node: thermal capture, audio ingest, AP, PocketBase | `[MEASURED]` — kernel journal records the exact model; this closed a long-running Pi 4B-vs-Pi 5 contradiction |
| **ESP32-S3** (`s3-mic-01`) | **the ONLY microphone node**; 4 MB flash | `[MEASURED]` — USB readout: rev v0.2, MAC `68:ee:8f:dd:31:3c` |
| **INMP441** (on the ESP32-S3) | MEMS mic; **no upgrade needed** | `[DATASHEET]` |
| **MLX90640** | 32×24 thermal array, I²C | `[DATASHEET]`; intermittently reliable in practice |
| **GY-SHT45** | pen-air temperature/humidity, I²C | owned, **unconnected and untested** |
| **Tapo C200C** | CCTV, RTSP → MJPEG | identity `[MEASURED]` (see Part 4) |
| **UPS HAT** (2×2600 mAh) | Pi power hold-up | `[DATASHEET]` |
| ~~ESP32-D0WD~~ | original node | **DECOMMISSIONED — do not resurrect** |
| ~~INMP441 on Pi GPIO~~ | former fallback mic | **REMOVED** — see below |

**BOM:** ₱6,400 across 6 line items `[VERIFIED]`. A 5-line-item subset totals
₱3,290 `[VERIFIED]`.

### 3.1 Why the Pi-GPIO microphone was removed — do not re-add it

It depended on `dtoverlay=googlevoicehat-soundcard`, which requires a physical
codec chip this board does not have. It returned **1,920,000 bit-exact zero
samples, all exactly 0, both channels** `[MEASURED]`. That is a null source, not a
quiet room. The ESP32-S3 barn mic is the only audio path.

### 3.2 The MLX90640 part number matters — get it right

This project specifies the **110° × 75°** variant: **MLX90640-ESF-BAA**.
(The 55° × 35° part is **BAB** — a different chip with different geometry.)
`[DATASHEET]` — datasheet §12.4, Table 15.

> An earlier project document asserted the reverse mapping. That was wrong and is
> corrected here. Confirmed against the datasheet and four vendor listings.

---

## 4. What the hardware physically CANNOT do — never claim otherwise

- **No individual pig identification** with an MLX90640 at pen distance.
- **No ear-base temperature measurement** — the resolution does not exist.
- **No ±0.8 °C thermal accuracy** — not attainable; see Part 2.
- **No direction, distance, or "which pig" from a single mono mic.** Physics: one
  diaphragm encodes zero spatial information.
- **No dead-reckoning of pig identity** from 2D video for unmarked same-breed
  pigs over hours — this is an open research problem, not an implementation gap.

These are **genuine research contributions** when framed as limitations, not
embarrassments to be hidden.
