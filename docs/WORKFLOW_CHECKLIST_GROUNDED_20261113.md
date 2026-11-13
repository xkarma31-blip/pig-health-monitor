# WORKFLOW CHECKLIST — grounded against the live system (2026-11-13)

The 19 items come from a checklist that lives outside this repo (it is quoted
into `docs/REPORT_LATEST.md:110-118`, `docs/academic_briefing.md:155-160` and
`docs/PIGPULSE_DAILY_BRIEFING_OCT272026.md:16`). **Every verdict below was
read off the working tree or the live devices — not from the checklist's
ticks.** A ticked box means the checklist says done; a **DONE** here means the
repository contains a working, verified artefact.

Legend: **DONE** · **PARTIAL** (some of it exists, named gap given) ·
**ABSENT** (searched hard, not there) · **BLOCKED** (waiting on something
outside the repo).

---

## The one-paragraph answer

Twelve of the nineteen are genuinely done or effectively done. The remaining
work is **not nineteen items — it is one chain**, and the chain is broken at
four of its five links. The chain is:

```
purposive sampling criteria  →  human-check workflow  →  labelled dataset
        →  training script + weights  →  fusion formula  →  health score
```

**Links 1, 2, 4 and 5 do not exist.** Link 3 (the raw footage) does. That
single chain is the real backlog. Everything else on the list is either
finished, blocked on a purchase, or waiting on a physical fix.

---

## 1. kuhag data online — **DONE** ✅

The public read path, end to end:

```
browser → Vercel /api/telemetry → Tailscale Funnel :443 → laptop readonly_pb_proxy
:8099 → laptop PocketBase :8090  (+ Pi PocketBase :8090 and Pi console :8080)
```

- `frontend/mobile_app/api/telemetry.js` — GET-only, collection allowlist
- `backend/workers/readonly_pb_proxy.py` — collection **and** field allowlist
- 650,546 telemetry rows on the laptop PocketBase, the freshest seconds old

**Made *correct* today.** Before the SHT45 fix, half the rows carried
`ambient=0, humidity=0` — "online" but lying. Now the zero-rate is **0.3%**
(7 of 2395 rows in the 04:00 hour).

## 2. extract-ug-processes-sa-mie — **DONE** ✅ (one gap closed today)

Our own derivations, not vendor wrappers:

| Component | Where |
|---|---|
| ITM inversion, drift comp, per-pixel baseline, zone scoring | `backend/thermal-pi/radiometry.py` |
| MLX90640 driver, API contract preserved from `sensors.cpp` | `backend/thermal-pi/mlx_reader.py` |
| Lenient JSON (the trailing-comma fix) | `backend/bridge/json_lenient.py` |
| Semantic-field guard (strips impossible temperature claims) | `backend/bridge/thermal_guard.py` |
| Audio normalisation + VAD clip extraction | `backend/processing/audio/normalize.py`, `extract_clips.py` |
| **PANNs cough classifier + trained logistic head** | `backend/cough/` — **added today** |

**The cough classifier had NO source in this repository.** It had been running
on the Pi since 2026-11-07 serving on `:8096`, and its 705-line source existed
only on the device. It is now version-controlled, byte-identical to the live
copy, with the model provenance recorded — see `backend/cough/README.md`.

## 3. selda-sa-raspi-ug-cam-nya-solida — **DONE** ✅

Three sensors with distinct roles (`CANON.md` §2.5 / §8):

| Sensor | Role |
|---|---|
| **Tapo C200C** | CCTV — RTSP → MJPEG, Pi-AP-only (management API still blocked by the cloud-owner password) |
| **MLX90640** | thermal — I²C, ~1.95 FPS |
| **ESP32-S3** | the only mic — TCP :9090 + SHT45 ambient |

## 4. papers chap 1 — **PARTIAL** ⚠️

`docs/CHAPTER 1_DRAFT_20260914.md` exists and is complete: rationale §1.1–1.2,
scope §1.6, limits §1.6, assumptions/delimitations §1.5, organisation §1.7.

**Gap: "SEP" is not defined anywhere in the repository.** A case-sensitive
search for `\bSEP\b` across every `.md`, `.txt`, `.json`, `.py` and `.js`
returns zero definitions — only "Sep" for September. Whatever SEP means in
your checklist, it has never been written down in the project.

## 5. train sa model — **PARTIAL** ⚠️

**Real and now in the repo:** the cough classifier's **trained logistic head**
— 2,048 coefficients, intercept, threshold `0.2061` (`backend/cough/head.json`),
applied to a frozen pre-trained PANNs `Cnn14_16k` body.

**Missing:**
- **no training script** — no `train.py`, no epochs, no loss curves
- **no model weights anywhere in the repo** — a search for
  `.pt .onnx .tflite .caffemodel .pth .keras .h5 .pkl .joblib` over the entire
  tree returns **zero files**
- `backend/cough/cnn14_16k_body.onnx` is 304 MB (a frozen *public* checkpoint,
  not work product) — sha256 recorded, not committed, because GitHub's per-file
  limit is 100 MB

Note the YOLO detector's model path `PIGDETECT_MODEL=./models/pig_yolov8n`
points at a **directory that does not exist**.

## 6. subway ug pig identification using yolo — **PARTIAL** ⚠️

`backend/cctv/pig_detector.py` exists and is honest about itself: *"scaffold
only… NOT WIRED IN"*, with a lazy `ultralytics` import and a centroid
tracker. It is not called by anything.

**Missing:** trained weights · training script · **labelled dataset** ·
integration into the live pipeline.

CANON §2.7 gives the physics honestly: YOLOv8n via NCNN ≈ 2–3 FPS on a Pi 4B
— enough for health monitoring, not for real time.

## 7. hybrid-network-approach — **DONE** ✅

Four access paths, which is what "hybrid" means here:

| Path | Where |
|---|---|
| **Pi-local full Expo app** — no laptop, no Vercel, no internet | `http://192.168.69.1/app/` |
| **Pi portal onboarding** → optional venue Wi-Fi → standalone WAN | `backend/portal/`, `deploy/wan-apsta/` |
| **Vercel-hosted app** via `/api/telemetry` + `/api/pi` | `frontend/mobile_app/api/` |
| **Laptop read-only proxy** (tailnet/Funnel) | `backend/workers/readonly_pb_proxy.py` |

mDNS-first Pi lookup with sticky candidates is in `readonly_pb_proxy.py:45-72` —
so the rig answers whether it is cabled to the barn AP, the home router or a
phone tether.

## 8. Order-Wifi-Adapter — **PARTIAL / possibly unnecessary** ⚠️

**This one may have been overtaken by events.** The requirement is documented
— a 5 GHz-capable USB adapter (RTL8812AU / rtl88x2bu) so the AP can be 5 GHz
while the built-in radio carries the WAN (`CANON.md:361-364`,
`deploy/wan-apsta/README.md:220-222`). Both radios Master tried were
hardware-faulty (`rtl8192cu` faults as a client; the AR9271 never enumerated —
and it is still plugged into the Pi, `wlan1` DOWN).

**But:** since the standalone-WAN work on 2026-11-12 the Pi holds a real 2.4 GHz
venue uplink on its own AP channel (ch 6 = 2437 MHz), which is where the
CCTV and the ESP32-S3 live anyway. The adapter is therefore only needed for a
**5 GHz venue** — and the 5 GHz path inside the barn was never verified to
reach.

**There is no procurement record for it** — `docs/shopping_list.md` (the
September Phase-1 BOM) does not list a Wi-Fi adapter at all.

**Decision needed:** is the adapter for a 5 GHz *venue*, or was it for the
two-radio split that the standalone-WAN work made unnecessary? Test the 5 GHz
reach first (a phone hotspot at the Pi's location is the cheap proxy CANON
§2.4 recommends) and buy nothing until that answers.

## 9. deploy sa cctv para kuha data — **PARTIAL** ⚠️

**Done and running:** `pigpulse-rtsp-recorder.service` — 15-minute segments,
`duration=900.17 s`, `bit_rate=1,552,964`, continuous, no gaps. The Pi holds
129 segments (14 GB) and rotates at a 5,000 MB free-space floor.

`backend/recordings/sdcard-archive-20261021/` holds **99 raw files (25 GB)**
recovered from the camera's dying SD card.

**Missing:**
- **no labelled or annotated CCTV data anywhere** — no YOLO `.txt` labels, no
  annotation JSON/CSV
- the Pi → laptop offload hop is **paused**
  (`/root/.cache/pigpulse-recs.pause-rsync`) and the offload script
  **reports success on total failure** (`rclone … || echo "rclone failed"`
  swallows the exit code)
- no retention-in-days policy on the Pi — only a free-space floor, so history
  is destroyed continuously

## 10. power management sa whole system — **PARTIAL** ⚠️

**The current ESP32-S3 firmware has no deep or light sleep at all** —
`WiFi.setSleep(false)` is set explicitly at two places. The deep-sleep
implementation (5-minute cycle) exists only in the **decommissioned** D0WD
firmware (`legacy/firmware/esp32d0wd-pigpulse/power.cpp:26-68`).

- **Pi:** only `pigpulse-ap-powersave.service` (radio power save, on the
  device, not in the repo)
- **Camera:** no power management at all
- **Battery / solar:** paper spec only (`docs/FINAL_SPEC_20260914.md:131-148`)

Energy math is documented (`docs/CALCULATION_REFERENCE_20261102.md:204-299`,
CALC 4–11).

## 11. esp-ug-mic-nya-i-connect-sa-raspi — **DONE** ✅

- ESP32-S3 mic → TCP :9090 → the Pi's ingest → `nonzeroPct 99.9%`,
  **1.33 GB** streamed, 48 kHz
- Tapo C200C → RTSP → MJPEG → `:8091` → proxied through `/cctv`
- MLX90640 → I²C on the Pi → ~1.95 FPS

All three are live on the Pi and reachable from the app.

## 12. butang ug-qr-sa-raspi — **DONE** ✅

`backend/portal/make-qr.cjs` generates the QR for
`http://192.168.69.1/?setup=1`; `portal.html` forces the setup flow; the SVG
is served at `/app/pigpulse-setup-qr.svg` and **deployed to the Pi today**
(release `20261113-114849`).

There is a **second** Wi-Fi join QR at
`backend/thermal-pi/static/wifi-setup.html` + `wifi-qr.svg`, linked from
`fusion.html:169`.

**Still untested: a physical phone scanning either QR.** The browser was
tested against the real Pi with external requests blocked; no phone has
completed the flow.

## 13. suggested-ng-buhat-design-sa-casc-para-3d-print — **DONE** ✅

`v3-mqtt-pocketbase/enclosure/`:

- 5 STLs — main body lower + lid, thermal housing, acoustic housing, pole
  bracket
- `enclosure/README.md` — manifest and materials
- `enclosure/recovery-20261018/revision-k/` — revision-k STLs + 12 GCODEs
- `COMPONENT_DIMENSION_RESEARCH.md` — a source-grounded dimension table,
  explicitly labelled *"NOT measured from the board"*

## 14. i determine if pila jud ang range or dimensions — **PARTIAL** ⚠️

The **math is done**: `docs/CALCULATION_REFERENCE_20261102.md:99-152` (CALC 1–3)
gives 4.28 × 2.30 m at 1.5 m, 5.71 × 3.07 m at 2 m, and 17.9 × 12.8 cm per
pixel, with datasheet provenance. `scripts/generate_coverage_viz.py` visualises
it.

**The gap is the part number, and it is exactly what the math depends on.**
The mounted MLX90640 is *expected* to be the wide **D110** variant
(`CANON.md:712-720`) but that has **never been verified** — the part number
is on the silkscreen only, with no I²C readout. The physical test is cheap:
*film a known-width object at a known distance and compare the measured angular
span against the datasheet.*

Until that is done, the coverage numbers are conditional on an unverified
assumption. **This is the cheapest open item on the whole list.**

## 15. i figure out ang mga math sa thermal cam — **DONE** ✅

- `docs/CALCULATION_REFERENCE_20261102.md` — Ta compensation, emissivity,
  accuracy budget
- `docs/CALCULATION_SOURCE_AUDIT_20261102.md` — per-claim provenance; it
  **caught** a pixel-pitch conflict, an emissivity-in-°C defect and a battery
  claim contradiction
- `backend/thermal-pi/radiometry.py` — the live implementation

**Known discrepancy, documented:** the legacy compensator
(`pull = (EMA − 25) × 0.1`) over-pulls by ~1.25 °C (43.6 vs 31.1 °C) and the
pipeline path bypasses it; `center` changed meaning from a 3×3 cluster average
to a zone-of-interest peak. A "+2 °C" delta between the two paths is
**methodology, not miscalibration** — compare like with like.

## 16. pag-synthesize-sa-mga-lahi-lahi-na-data — **PARTIAL** ⚠️

**Time alignment is real, in three layers:**

| Layer | Where |
|---|---|
| Laptop-anchored timeline for a Pi with no RTC | `backend/bridge/time_anchor.py` |
| Shared Pi clock + `pickAligned` | `frontend/mobile_app/src/utils/pi-clock.ts` |
| Time-bucketed join of thermal + sound + alerts | `frontend/mobile_app/src/app/web/analytics.tsx` |
| Manual overlay for eyeballing | `backend/thermal-pi/static/fusion.html` |

**Missing: the actual fusion.** The weighted health score
(0.6·z_cough + 0.4·z_fever) exists **only as prose**.
`docs/CALCULATION_REFERENCE_20261102.md:466-480` marks it
**"❌ UNDEFINED — not linear, max error 7.1 points"**. No `healthScore` or
z-score implementation exists anywhere in `backend/` or `mobile_app/src/`.

## 17. human-nas-check-2 — **ABSENT** ❌

Searched `docs/`, `backend/`, `mobile_app/src/`, `.planning/` for
human check / human review / manual review / human verification / spot check /
review queue / human-in-the-loop / vet review / vet label / acknowledge / flag
for review / moderation / audit queue.

**No review queue, no human-verification path, no vet-label workflow.** Two
incidental hits only: a dataset note (`docs/FULL_SOURCE_REFERENCE.md:63`) and
a *plan* line (`docs/SESSION_REFERENCE_20260914.md:371`). Alert
`acknowledge` endpoints exist only in a design sketch
(`docs/SESSION_ORCHESTRATION_20260914.md:323,336-337,386`).

## 18. suggested-nasad-ang-chap-3 — **PARTIAL** ⚠️

Only an **outline** (3.1–3.8: Research Design, Hardware Development, Software
Architecture, Data Collection, Model Development, Calibration Protocol,
Validation Plan, Statistical Analysis) at
`docs/SESSION_REFERENCE_20260914.md:352-393`, plus a 4-line stub at
`docs/PIG_HEALTH_MONITOR_COMPLETE_RESEARCH.md:620`. There is no standalone
Chapter 3 file; the planned `chapter3_system_draft.md`
(`.planning/PLAN_DETAILED.md:206`) does not exist.

## 19. buhat ug criteria for purposive sampling — **ABSENT** ❌

Searched for purposive sampling / convenience sampling / snowball / theoretical
sampling / criteria for / eligibility / screening criteria / inclusion
criteria / exclusion criteria / sampling frame / saturation / participant /
respondent across `docs/`, `.planning/`, `v3-mqtt-pocketbase/docs/`.

**No criteria document of any kind.** Every hit is the checklist item quoted
back inside the briefing documents.

---

## Blocked on things outside the repo

| Item | Waiting on |
|---|---|
| Tapo SD recording armed, recordings readable | the **cloud-owner password** — the camera is bound to a friend's TP-Link account |
| Camera footage offloaded to Drive | the **Pi → laptop rsync hop is paused**, and the offload script reports success on failure |
| 5 GHz venue | whether 5 GHz reaches inside the barn — untested |
| SHT45 ambient accuracy | **the physical I²C connection** (see the firmware A/B: the fault is a bad connection, not a software one) |

---

## The sequence I would take next

The chain is the work, not the list. In this order, because each link is the
*input* to the next:

1. **Write the purposive sampling criteria.** It is one page, it is the
   methodological gate on everything downstream, and it is the cheapest item
   on the list. It also tells you *what* to label, which is what step 3 needs.
2. **Define the human-check workflow.** Who labels, what the label schema is,
   how disagreements are resolved, how the confidence is recorded. Without it
   the labelled dataset cannot be trusted and the model cannot be defended.
3. **Annotate from footage you already have** — 25 GB recovered from the SD
   card plus 14 GB on the Pi. Start with the thermal frames, which are
   already timestamped against the shared clock.
4. **Write the training script and produce weights.** Commit them this time —
   the repo has *no* weights today, and the YOLO detector's model path points
   at a directory that does not exist.
5. **Define the fusion formula** and implement it, replacing the "❌
   UNDEFINED" note. The weight between cough and fever has to be justified,
   and a linear z-score combination has a 7.1-point maximum error, which is
   worth deciding properly rather than shipping.
6. **Only then** the detection path: wire `pig_detector.py` in, point it at
   real weights, and let the CCTV feed the model.

**Two free items worth doing while you are in there:** verify the MLX90640
variant (the cheapest open item on the list, and everything about coverage
depends on it), and physical-phone-test the QR.

**One thing to decide:** whether the Wi-Fi adapter is still wanted. The
standalone-WAN work may have made it unnecessary — test the 5 GHz reach
before buying anything.
