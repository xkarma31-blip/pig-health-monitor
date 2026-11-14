# Chapter 3 — Grounded Data Form (A–F)

**Composed:** 2026-11-14 · **Method:** read-only extraction from the live repo + device readouts · **Branch:** `feat/v3-mqtt-pocketbase`
**Field labels:** follow the working base (`chapter3_system_draft.md`). The original questionnaire wording was not recovered from any file, so none is invented here. If the original form surfaces, re-label only — do not touch values.
**Rules applied:** values copied exactly as written in their sources, with units. Nothing rounded, converted, or "fixed". Where sources disagree, both values are kept and listed in **F**. Absent data is marked, not filled.

**Source tags**

| Tag | Meaning |
|---|---|
| `[CODE file:line]` | repository file, read this session |
| `[MEASURED 2026-11-13]` | live device/tool readout (Pi, ESP peer, MQTT, services) |
| `[TOOL page]` | live HTTP endpoint page |
| `[DOC file:line]` | repository document |
| `[UNKNOWN]` | not present in any source read |
| `[NOT MEASURED]` / `[NOT DONE]` / `[NOT DECIDED]` | no record exists |

**Attachments (this submission):** `docs/chapter3_attachments_20261114/` — `train_head_5s.py`, `head_results.json`, `operating_points_5s.json`, `RESULTS-5s.md`, `CODE_EXCERPTS.md` (verbatim code/config for B11–B13, C1–C5). Firmware build output: `v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/docs/KNOWN_GOOD.md:63-64`.

---

## A. Hardware / Sensing

**A1 — Board / chip**
- Board: `esp32-s3-devkitc-1` (ESP32-S3 DevKitC-1). `[CODE v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/platformio.ini]`
- Toolchain on record: `espressif32@7.0.1`, Arduino `2.0.17`. `[CODE platformio.ini; DOC KNOWN_GOOD.md:63-64]`
- Firmware on record: `pigpulse-mic-sht45-20261113-shtfinal`; live image sha256 `0b0b4ab1b80759cc7fe1fea98d61e2f87c0e71577c7d1602c1cf157754c1acf2`. `[CODE …ino:46; DOC KNOWN_GOOD.md:55-58]`
- MAC (read from the running device): `68:ee:8f:dd:31:3c`. `[MEASURED 2026-11-13]`
- Decommissioned / not in this build: ESP32-D0WD. `[DOC CANON.md:546-552]`

**A2 — Memory**
- Build output: RAM `116,900 B (35.7%)` · Flash `781,485 B (59.6%)` · image `781,872 B`. `[CODE DOC KNOWN_GOOD.md:63-64 — real build output]`
- Flash size setting: `board_upload.flash_size = 4MB`. `[CODE platformio.ini]`

**A3 — Mic + pins**
- Mic: one I²S MEMS microphone, INMP441 (single — not a pair). `[DOC KNOWN_GOOD.md:592, :622, :635; :772 "Master confirmed the INMP441 is connected"]`
- Pins: `SCK=4, WS=5, SD=6, L/R=GND`; 3.3 V supply. `[CODE …ino:28-36; DOC KNOWN_GOOD.md:492-502]`
- Ambient sensor bus: SHT45 `SDA=GPIO8, SCL=GPIO9`; 3.3 V supply. `[CODE …ino; DOC KNOWN_GOOD.md:492-502]`
- SHT45 I²C address: `0x44`. `[CODE …ino:317, :350, :370]`
- Removed for cause: INMP441-on-Pi-GPIO (returned bit-exact zeros — null source, not quiet room); removed 2026-09-29. `[DOC CANON.md:551, :568-572]`

**A4 — Sample rate / depth**
- Capture format: `S16LE MONO 48k`. `[CODE …ino:923]`
- Signal path uses `>>16` sample shift. `[CODE …ino:1092]`
- Classifier input rate: `16000 Hz`, mono. `[TOOL /cough/api/status "rate":16000, "mono"; MEASURED 2026-11-13]`

**A5 — Continuous listening**
- Mic streams continuously over TCP to `192.168.69.1:9090`. `[CODE …ino:52-53]`
- Live 2026-11-13: ESP peer `192.168.69.15:64934`, `rate 48000`, `nonzero 100%`; cough service uptime `19637.5 s`, bytes `410,870,938`, reconnects `370`, buffered `4.02 s`, windows scored `2110`, dropped gappy `445`, EOFs `41`. `[MEASURED 2026-11-13]`
- Thermal loop publish interval `10 s`; uptime `18857 s`; frames `37478`. `[MEASURED 2026-11-13]`

**A6 — MLX variant + refresh**
- Sensor: MLX90640; bus `/dev/i2c-1` @ `100000 Hz`; address `0x33`. `[CODE backend/thermal-pi/config.py; MEASURED 2026-11-13]`
- Variant: expected D110 (110°×75° wide) — **UNVERIFIED**; no I²C part-number readout exists (part number is on the module silkscreen only). `[DOC CANON.md:728-758]`
- Refresh: setting `REFRESH_HZ 4.0` (register `0x03`). `[CODE config.py; …ino]` — measured `2.00 FPS`, read `371 ms`. `[MEASURED 2026-11-13]`
- Per-pixel footprint at 2 m (spec-derived, not measured): D55 ≈ `6×5 cm`; D110 ≈ `12×10 cm`. `[DOC CANON.md:728-758]`

**A7 — Mount geometry**
- Placement rule: "near the monitored area at animal height, thermally isolated from electronics, ventilated shaded guard". `[DOC CANON.md:640-652]`
- Configured distance: `distance_m 2.0`. `[CODE config.py]`
- Coverage at 2.0 m (calculation): `5.71 × 3.07 m`. At 1.5 m: `4.28 × 2.30 m`. `[DOC docs/CALCULATION_REFERENCE_20261102.md — CALC 2, CALC 1]`
- ROI row gate: `roi_row_min 4`. `[CODE config.py]`
- Mount hardware / angle / tripod: `[UNKNOWN]` — no record.
- No reference thermometer in view (affects baseline mode). `[DOC CANON.md:726]`

**A8 — Pi model / OS / power**
- Board: `Raspberry Pi 4 Model B Rev 1.2`, revision code `c03112`. `[MEASURED 2026-11-13]`
- OS: Debian 13 `trixie`; kernel `6.18.50+rpt-rpi-v8`; `aarch64`. `[MEASURED 2026-11-13]`
- Memory: total `3.7Gi`; used `1.1Gi`; free `95Mi`; available `2.7Gi`. `[MEASURED 2026-11-13]`
- CPU temperature `65.2 °C`; `throttled 0x0`. `[MEASURED 2026-11-13]`
- Disk (`/`): `29G` total / `23G` used / `5.0G` avail / `83%`. `[MEASURED 2026-11-13]`
- Pi power source (PSU model / rail): `[UNKNOWN]` — no record. Standing rule on record: "no CPU, thermal, throttling, memory, or SD-endurance measurements … may be invented from a spec sheet". `[DOC CANON.md:555-590]` (the numbers above are 2026-11-13 device readouts, not spec sheet).

**A9 — ESP32 power**
- Operating/usb path: USB (USB serial reported on device; used for flash and debug). `[DOC KNOWN_GOOD.md; DOC CANON.md:585-590]`
- Voltage/current at runtime: `[NOT MEASURED]`.
- Draft §3.4.5 claim on record: "A dual 18650 battery pack (6000 mAh total) provides 72+ hours of autonomous operation" + sleep-current table (`~15 µA / ~2.4 mA / ~47 mA / ~340 mA`). No measurement found for any of these. `[DOC chapter3_system_draft.md:153-155]` → F11.

**A10 — Ambient sensor**
- Sensor: SHT45 @ `0x44` (see A3). `[CODE …ino:317, :350, :370]`
- Live at read time: status `sht-missing`; last-good `30.94 °C` / `71.39 % RH`; age `2682.2 s`. `[MEASURED 2026-11-13]`
- CANON record: "Connected and reporting as of 2026-11-03"; fresh ≈ `33-34 °C` / ≈ `72 % RH`. `[DOC CANON.md:640-652]`
- Bus health: readings are real; transport bug fixed 2026-11-13 (ambient now attached to 59/60 messages; intermittent I²C NACKs retained in firmware, `sle=2`); root cause is physical wiring. `[CODE commit 5f33d24; MEASURED 2026-11-13]`

---

## B. Model / Training / Evaluation

**B1 — Training tool**
- Python on the laptop: frozen PANNs `Cnn14_16k` embeddings (2048-d) + scikit-learn logistic-regression head. `[CODE chapter3_attachments_20261114/train_head_5s.py; DOC RESULTS-5s.md]`
- Machine: CPU only, `~3 GB RAM`, no GPU. `[DOC RESULTS-5s.md]`
- Draft claims Edge Impulse EON / MobileNetV2 — not the trained artifact on record. `[DOC chapter3_system_draft.md]` → F6.

**B2 — Layers**
- Head: one linear layer — `LogisticRegression(C=1.0, unweighted, 2048-d -> 1)`. `[CODE chapter3_attachments_20261114/head_results.json — meta; DOC backend/cough/README.md]`
- Backbone: `PANNs Cnn14_16k (frozen)`. `[TOOL /cough/api/status]`

**B3 — Features**
- `2048-d` embeddings per `5.0 s` window; `501` frames per window; own numpy log-mel front end. `[CODE backend/cough/cough_classifier.py; TOOL /cough/api/status]`
- ONNX export frozen "from bn0 onward". `[DOC backend/cough/README.md:29-32]`

**B4 — Data counts**
- aSwine: `154 files → 10,979 labelled 1-s intervals`, `15.46 h`, `16 kHz mono`. `[DOC P0-CORPUS-STATUS.md:13/20]`
- Class counts: `627 : 8,084 ≈ 1 : 12.9` (cough : other). `[DOC P0-LABEL-TABLE.md:35]`
- Multi-label composition: of `830` cough intervals, `398` single-label, `432` carry ≥1 co-occurring label. `[DOC P0-LABEL-TABLE.md:40-46]`
- MAP-DA (held out): `725 clips`, `16.08 min`. `[DOC P0-CORPUS-STATUS.md]`
- Merged corpus: `14,119` 5-s windows. `[DOC RESULTS-5s.md]`
- Own barn: "capture works, no in-band event yet demonstrated". `[DOC P0-CORPUS-STATUS.md]`
- File duration: `358 s` files (P0-CORPUS) vs `361 s` (P0-MANIFEST) → F7.

**B5 — Split**
- File-level split, seed `20261104`, 20% test → train `123` files (`627` cough / `8,084` other / `8,711` intervals); test `31` files (`203` / `2,065` / `2,268`); file overlap `0`. `[DOC P0-LABEL-TABLE.md; CODE train_head_5s.py]`
- aSwine README: `80 / 20 train / test`. `[DOC P0-MANIFEST.md:55]`
- MAP-DA: no train split — entire deposit is held out cross-species. `[DOC P0-CORPUS-STATUS.md]`

**B6 — Epochs / hyperparameters**
- `LogisticRegression(C=1.0, max_iter=2000, class_weight=cw, n_jobs=-1)`. `[CODE chapter3_attachments_20261114/train_head_5s.py:70-72]`
- No epochs (linear head over frozen features). Two variants trained: `balanced` (`class_weight`) and `unweighted`.
- Imbalance handling: inverse-frequency / macro-F1 weighting; imbalance `1 : 11.9` recorded in the training notes. `[DOC P0-LABEL-TABLE.md; RESULTS-5s.md]` → F8.

**B7 — TEST metrics + confusion** (test set only)

From `head_results.json` + `operating_points_5s.json` `[CODE chapter3_attachments_20261114/]`:

| Variant | Eval set | n (pos) | macro-F1 | F1 | PR-AUC | ROC-AUC | confusion |
|---|---|---|---|---|---|---|---|
| unweighted, thr `0.2061` | aSwine holdout | 2268 (203) | `.6966` | `.4533` | `.4037` | `.8079` | `[[1920,145],[101,102]]` |
| unweighted, thr `0.2061` | MAP-DA cross-species | 3140 (266) | `.4779` | `0.0` | `.3811` | `.8504` | `[[2874,0],[266,0]]` |
| balanced, thr `0.7405` | aSwine holdout | 2268 (203) | `.6777` | `.4208` | `.3579` | `.7886` | `[[1904,161],[106,97]]` |
| balanced, thr `0.7405` | MAP-DA cross-species | 3140 (266) | `.4778` | `0.0` | `.1397` | `.6727` | `[[2873,1],[266,0]]` |

- Window-length A/B: 1 s → 5 s: same-farm ROC `0.664 → 0.700`, F1 `0.465 → 0.501`; cross-species ROC `0.485 → 0.850`. `[DOC RESULTS-5s.md]`
- Best-F1 operating points: aswine unweighted thr `0.2061` → F1 `.4533` (recall `.502` / precision `.413`); aswine balanced thr `0.7405` → F1 `.4208` (recall `.478` / precision `.376`); mapda unweighted thr `0.0` → F1 `.4513` (recall `.602` / precision `.361`). `[CODE operating_points_5s.json]`
- Actual confusion matrix is binary 2×2. Chapter 4 draft claims "3×3 confusion matrix (COUGH, NOISE, SILENCE)". `[DOC chapter4_methodology_draft.md:157]` → F6.

**B8 — Quantization**
- Logistic head: none — `cough_head.pkl`, `9,248 B`. `[CODE backend/cough/]`
- PANNs ONNX export: `318,670,463 bytes` (`304 MB`), float32; "float32 rounding, not a" behavioural difference. `[DOC backend/cough/README.md:29, :96-99]`
- No INT8 / FP16 conversion documented for the live path. `[DOC backend/cough/README.md]` → F6 (draft INT8/EON claim).

**B9 — Size / RAM** (real build output)
- ONNX file `318,670,463 bytes`; logistic head `9,248 B`. `[CODE backend/cough/README.md:29; backend/cough/]`
- Runtime RSS measured on the Pi: `432.7 MB`. Also on record: `432 MB` (README table). `[MEASURED 2026-11-13; DOC backend/cough/README.md:111]`

**B10 — Inference ms** (measured on the real board)
- On the Pi (the machine that actually classifies): median `1567.5 ms`, p95 `1818.4 ms`. `[MEASURED 2026-11-13 /cough/api/status aggregate]`
- Threads: `ORT_THREADS 2` — noted reason on record: "the 4 Hz thermal loop keeps the other cores". `[CODE backend/cough/cough_classifier.py]`
- Draft claim: "< 250 ms on ESP32-S3". `[DOC chapter3_system_draft.md]` → F13.

**B11 — Threshold τ**
- τ = `0.2061`, described on record as "F1-optimal on the aSwine holdout". `[CODE backend/cough/cough_classifier.py THRESH:94; TOOL /cough/api/status]`
- Verdict bands: `0.00 QUIET / 0.05 LOW / 0.20 ELEVATED / 1.01 HIGH`. `[CODE cough_classifier.py:340-344]`

**B12 — Debounce**
- `NONE` — no debounce, cooldown, or refractory logic in the classifier code. `[CODE cough_classifier.py; repo-wide grep]`
- Closest mechanisms: gappy windows discarded (`GAP_TOLERANCE 1.25`; live `dropped_gappy 445`) and rate aggregation over `AGG_WINDOW_S 60.0`. `[CODE; MEASURED 2026-11-13]`
- Thermal side analogue: `sustain_frames 5` persistence (see C4). `[CODE radiometry.py]`

**B13 — Alert rule**
- Cough: `NOT IMPLEMENTED` — no alert generation found for the classifier; only `readonly_pb_proxy.py:148` references `coughCount` (read-only). `[CODE]`
- Thermal: alert ingest exists (bridge; raw values up to `476.89 "degC"` suppressed at ingest). `[CODE local_bridge.py:330-360]`

**B14 — Where classification runs**
- On the **Pi** — backend service at `127.0.0.1:8096`; the ESP32 streams audio only. `[CODE; MEASURED 2026-11-13]`
- Draft claims an on-ESP32 "TinyML Inference Component". `[DOC chapter3_system_draft.md]` → F6/F13.

---

## C. Thermal Pipeline

**C1 — Pen reading**
- Raw instrument values published; the pig-temperature claim is stripped (T2 decision 2026-11-02): "Strip the pig-temperature claim, keep the raw instrument values". `[CODE backend/bridge/local_bridge.py:330-360]`
- Device identity on MQTT: `pi-thermal-01`. `[MEASURED 2026-11-13]`

**C2 — Pig pixels**
- Gates on record: `min_area 6` / `max_area 600`; `delta_suspect 1.0` / `delta_fever 1.5`; `absolute_fever_floor 40.0`; herd `animal_offset 3.0` / `herd_min 3` / `animal_floor 34.0`; candidate threshold `median + 1.5`; `roi_row_min 4`. `[CODE backend/thermal-pi/radiometry.py; config.py]`

**C3 — Baseline**
- `baseline 30` frames / `warmup 10`; drift `alpha 0.2` / `calib 8`; clamp `±2.5 °C` EMA (Jiao et al. 2022); `driftMode: "frozen"` is normal operation (no reference thermometer in view). `[CODE radiometry.py; DOC CANON.md:726-736]`
- 2026-11-04 record: absorbed `1.52 °C`, refMedian moved `~0.2 °C` (stable). `[DOC CANON.md:728-736]`
- Live: `eps 0.95`, frame age `0.5 s`. `[MEASURED 2026-11-13]`

**C4 — Fever thresholds / persistence / cooldown**
- Config temperatures on record: `38.5 / 39.5 / 40.0 / 41.0`. `[CODE config.py]`
- Persistence: `sustain_frames 5`. `[CODE radiometry.py]`
- Classification function `_classify`: HYPERTHERMIA confidence `1.0`; FEVER `0.95`; herd-relative `min(.99, .55 + .1 × excess)`; temporal FEVER `0.6 × base + 0.4 × area`; SUSPECT `min(.7, .4 + .1 × d)`. `[CODE radiometry.py:691-721]`
- Cooldown: `NONE` — no refractory / cooldown logic anywhere in thermal-pi. `[CODE]`

**C5 — Emissivity**
- Coded value: `EPS_EAR_BASE .978`. `[CODE radiometry.py:67]`
- `eps_here` MUST be `1.0` (double-correction guard). `[CODE radiometry.py:526]`
- Coded vs Kirchhoff divergence on record: coded `38.72 / Δ+0.21` vs K `40.24 / Δ+1.74` — "understated ≈8.1×". `[DOC docs/CALCULATION_REFERENCE_20261102.md:110-150, :174-182]`
- References on record: Soerensen `doi:10.1016/j.compag.2014.09.003`; Sensors `doi:10.3390/s140712305`. `[DOC CALCULATION_REFERENCE_20261102.md]`

**C6 — Smoothing**
- `FRAME_AVERAGE_COUNT=4`; `alpha 0.3`; `solar 0.1`; `TA_SHIFT 8.0`. `[CODE config.py]`
- Drift EMA `α 0.2` (see C3).

**C7 — ML for thermal**
- `NONE` — thermal-pi has no ML dependencies; physics/rules only. `[CODE backend/thermal-pi/ — dependency scan]`

---

## D. Transport / App / Storage

**D1 — ESP32→Pi protocol**
- Audio: raw TCP `192.168.69.1:9090`, `S16LE MONO 48k`. `[CODE …ino:52-53, :923]`
- Thermal: MQTT as `pi-thermal-01`; publish interval `10 s`. `[MEASURED 2026-11-13]`
- Ingest on the Pi: `esp_audio_ingest.py` (audio), thermal publisher `thermal_publish.py`. `[CODE backend/thermal-pi/]`

**D2 — Pi→app notifications**
- Bridge T2 suppression policy (quoted above in C1). `[CODE local_bridge.py:330-360]`
- Timestamp assignment at ingest: `timestamp = int(ANCHOR.now_ms())` (unconditional). `[CODE local_bridge.py]`
- App side: `expo-notifications` dependency present; no push-token registration usage found. `[CODE]`

**D3 — App / notification fields**
- Alerts fields: `deviceId / type / severity / message / timestamp` + `synced`. `[CODE pb_migrations]`
- Access rules `@request.auth.id != ""` on telemetry `dmexc02x8cfguql`, alerts `x9p4waw6rg6gtck`, devices `lz1wh64o7hjd6bs`, audio_events `0ergv3h4zoihxqy`; lock-writes migration `1798500000_updated_collections_lock_writes.js:19` applied live 2026-11-03. `pigs.createRule` stays `""`. `[CODE pb_migrations; MEASURED]`

**D4 — DB + storage**
- PocketBase data dir: `/home/pigpulse/pocketbase/`. `[MEASURED 2026-11-13]`
- CCTV recordings: `OUTDIR /home/pigpulse/cctv/recs`; `SEG 900` s; `FLOOR 5000` MB. `[CODE backend/cctv/rtsp_recorder.py]`
- Live: recordings `14G`; latest `seg_20261112_164225.mp4`. `[MEASURED 2026-11-13]`
- Cloud mirror on record: `649,685` telemetry rows on the laptop PocketBase (`574,070` `s3-mic-01`, `71,042` `pi-thermal-01`). `[DOC CANON.md:580-585]`

**D5 — Farm Wi-Fi**
- AP: `ssid=PigPulse`; `hw_mode=g`; channel `6`; WPA2-PSK (passphrase redacted in this document — it lives only in the live hostapd configuration). `[MEASURED hostapd; redacted per policy]`
- DHCP: `dnsmasq` range `192.168.69.2–100`, lease `12h`; `wlan0` static `192.168.69.1/24`. `[MEASURED]`
- Camera lease: MAC `18:69:45:fb:d4:be` → `192.168.69.2`. `[MEASURED]`
- Other interfaces: `wlan1` RTL8188CUS `0bda:8176` — DOWN (spare dongle); `tailscale0` up; laptop uplink `2.4 GHz`, channel `6`, `−55 dBm`. `[MEASURED 2026-11-13]`

**D6 — Video camera**
- Tapo unit on record: HW `5.0`, FW `1.2.1 250324`. `[DOC CANON.md:978-987]`
- Pipeline: RTSP → `rtsp_recorder.py`. `[CODE backend/cctv/rtsp_recorder.py]`
- Port-status conflict: CANON states "There is no port 8091. Any doc saying otherwise is stale." (`:887-895`); Pi `/cctv` references proxy `127.0.0.1:8091` (`:947-951`). `[DOC CANON.md]` → F3.

---

## E. Metrology / Ground Truth

**E1 — Thermometer**
- No reference thermometer in view. `[DOC CANON.md:726]`
- MLX accuracy validation open: "Requires empirical testing with known-reference temperatures … Next experimentation cycle". `[DOC DAILY_BRIEFING_2026-09-28.md:81-83]`

**E2 — Heated target**
- Bulb bench record: `32.9 °C` / `71 %` → THI `85.9` severe. `[DOC CANON.md:655-663]`
- FOV physical test prescribed but `[NOT DONE]`: "film a known-width object at a known distance and compare the measured angular span against the datasheet". `[DOC CANON.md:728-758]`

**E3 — Playback speaker**
- Plan only: "Voice Alerts … Speaker + TTS … ₱100". `[DOC CORE_VS_ADDONS_20260914.md:32]`; "Voice alerts … Speaker … TTS on RPi … P3". `[DOC ARCHITECTURE_V3_20260914.md:283]`
- Deployment status: `NOT DEPLOYED` — no speaker in the build; no playback test found. `[CODE/DOC scan]`

**E4 — Observer / labeling**
- Labels are weak intervals only: `TosseEspirro` marks an interval that contains a cough — no onset/offset. `[DOC P0-MANIFEST.md; P0-LABEL-TABLE.md]`
- Observer session: `[UNKNOWN]` — none documented.

---

## F. Conflicts / Undecideds (recorded, not resolved)

| # | Conflict | Sources |
|---|---|---|
| F1 | Location count: nine vs eight | `CANON.md:126-131` |
| F2 | Mic topology: dual-mic array (`Mic A − Mic B` spectral subtraction) vs single INMP441 build; `.planning/` also says "dual INMP441 (we have 1 mic on ESP32-S3)" | `docs/pig_health_monitor_concept_paper.md:31-34`; `CANON.md:836` |
| F3 | Port `8091`: "no port 8091" vs `/cctv` proxy references | `CANON.md:887-895` vs `:947-951` |
| F4 | MLX footprint per pixel: `17.9 × 12.8 cm` vs `~6×5` vs `≈12×10`; "Strike it" note sits on the `~6×5` line | `CALCULATION_REFERENCE_20261102.md`; `CANON.md:357, :655-663, :728-758` |
| F5 | Refresh: setting `4.0 Hz` vs measured `2.00 FPS` | `config.py` vs `[MEASURED 2026-11-13]` |
| F6 | Chapter 4: "3×3 confusion matrix (COUGH, NOISE, SILENCE)" + TinyML-on-ESP32 + Edge Impulse INT8 vs binary 2×2 logistic head on the Pi | `chapter4_methodology_draft.md:157`; `chapter3_system_draft.md` vs `head_results.json`; `/cough/api/status` |
| F7 | File duration: `358 s` vs `361 s` | `P0-CORPUS-STATUS.md:13` vs `P0-MANIFEST.md:55` |
| F8 | Class ratio: `1 : 12.9` vs `1 : 11.9` | `P0-LABEL-TABLE.md:35` vs training notes (`RESULTS-5s.md`) |
| F9 | Firmware naming: `shtretry` vs `shtfinal` (both names on record) | `KNOWN_GOOD.md` |
| F10 | Sensor: concept paper AMG8833 IR Grid-EYE (8×8, bicubic to 32×32) vs actual MLX90640 (32×24) | `docs/pig_health_monitor_concept_paper.md:39` vs `config.py` |
| F11 | Power: draft "dual 18650 … 72+ hours" + sleep currents vs no measurement | `chapter3_system_draft.md:153-155` |
| F12 | MLX variant D110 vs D55 — unverified (no part-number readout) | `CANON.md:728-758` |
| F13 | Inference: draft "< 250 ms on ESP32-S3" vs measured median `1567.5 ms` on the Pi | `chapter3_system_draft.md` vs `[MEASURED 2026-11-13]` |
| F14 | Draft SD buffering / deep sleep / µA currents vs no code or measurement found | `chapter3_system_draft.md:157-159` |
| F15 | Two SD cards exist; which card boots matters — re-verify capabilities per boot | `CANON.md:555-567` |
| F16 | Purposive-sampling criteria: ABSENT — checklist §19 outstanding; net-new draft attached separately | `WORKFLOW_CHECKLIST_GROUNDED_20261113.md:285-345` |

---

## Attachment index

| File | Feeds |
|---|---|
| `chapter3_attachments_20261114/train_head_5s.py` | B1, B6 (verbatim training script) |
| `chapter3_attachments_20261114/head_results.json` | B7 (test metrics + confusions) |
| `chapter3_attachments_20261114/operating_points_5s.json` | B7, B11 (operating points) |
| `chapter3_attachments_20261114/RESULTS-5s.md` | B7, B10 (performance write-up) |
| `chapter3_attachments_20261114/CODE_EXCERPTS.md` | B11–B13, C1–C5 (verbatim code/config excerpts) |
| Firmware build output | A2 — `firmware/esp32s3-mic-ambient/docs/KNOWN_GOOD.md:63-64` |

*End of form — 2026-11-14.*
