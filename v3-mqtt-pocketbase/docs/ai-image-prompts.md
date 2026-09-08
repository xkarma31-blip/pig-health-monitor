# PigPulse v3 — AI Image Prompts + Reference Links

> **Version:** 1.0 — September 8, 2026
> **Why this file:** no configured image provider is available in this environment (9router = text-only; Gemini image quota = 0), so the diagrams are shipped as **local SVG** (see below) plus these **ready-to-run prompts** for any image tool you open later (midjourney, flux, gemini, dall-e).

---

## 1. Architecture diagram (system overview)

> Prompt for a diagram tool:
>
> "Clean technical architecture diagram, flat vector style, dark navy background (#1a1a2e) with teal/cyan accents. Left to right flow with labeled boxes:
> (1) ESP32-S3 sensor node — 2 units, each with microphone + MLX90640 thermal — labeled '8 kHz cough ring, 32×24 thermal ROI';
> (2) Mosquitto MQTT broker (Docker) labeled 'wifi :1883';
> (3) v3 MQTT Bridge (systemd native) labeled 'REST write-through';
> (4) PocketBase (native, :8090) labeled 'telemetry + alerts + vet labels — retention 7d / 20k';
> (5) OpenResty API gateway (:80);
> (6) Expo mobile app 'PigPulse' phone. A parallel Pi 5 'compute budget 35 ms STFT→Mel→CNN-LSTM' box under the bridge. Arrows show data flow; keep boxes rounded, minimal text, no logos."

## 2. Data-flow diagram (capture → corpus → model)

> "Data-flow diagram, flat vector, same navy/teal dark theme. Horizontal pipeline of 6 stages with small icons:
> 1) Barn sensors (mic + thermal + weather) → 2) Edge watchdog (cough ring, STFT/Mel, band = GREEN≥60 / YELLOW 40–59 / RED < 40) → 3) MQTT publish → 4) PocketBase corpus (status enum NORMAL|WARNING|CRITICAL|INFO, vet labels, suspect flags) → 5) Export (ndjson → Parquet) → 6) Training (CNN-LSTM vs heuristic baseline; KPI = 22 ms edge latency). Under the corpus box add a small 'retention evict job (age-then-capacity)' loop icon. Minimal labels, arrow weights show primary flow."

## 3. Barn deployment shot (marketing / poster)

> "Photorealistic, warm natural light: inside a clean modern pig barn, a small white ESP32-S3 sensor module with microphone grille mounted on a wooden railing ~1.5 m above a group of healthy pink pigs; a Raspberry Pi 5 with compact fan heatsink on a shelf in the background; soft depth of field; no people; no logos; 16:9."

## 4. Mobile alert screenshot-style mock

> "Flat UI mock of a phone app 'PigPulse': dark theme, top card 'RESPIRATORY ALERT — Wilbur (pig-004)' red accent, band badge 'RED · ReHS 28', RDI sparkline (24 bars teal), second card 'Telemetry storage: 12,340 retained · 282.6 KB · window 7 days', third card 'Clock Day 14:30 · Raining 45%'. High contrast, legible at small size, no camera UI."

---

## Swine/thermal/audio reference links (verified accessible 2026-09-08)

- **SoundTalks review (RDI/ReHS research base)** — PMC article, open access:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10251864/
  > Confirms: RDI increases with MHP infection, varies with population size, and ReHS-style patterns differ per pathogen (double-peaked flu vs gradual MHP) — direct support for our band thresholds and for the calm-vs-cluster distinction.
- **SoundTalks official site** (RDI/ReHS semantics): https://www.soundtalks.com/
- **Managing respiratory disease in finisher pigs (PRDP)** — ScienceDirect:
  https://www.sciencedirect.com/science/article/pii/S0167587720308928
- **Adafruit MLX90640 Pi thermal camera guide**:
  https://learn.adafruit.com/raspberry-pi-thermal-camera
- **MLX90640 tech notes** (32×24, 768 sensors, ±1 °C, ≤ 64 Hz):
  https://www.robot-electronics.co.uk/htm/mlx90640tech.htm
- **PocketBase docs** (records API, collections, hooks): https://pocketbase.io/docs/
- **Mosquitto MQTT**: https://mosquitto.org/
- **OpenResty** (API gateway on :80): https://openresty.org/en/

> Mark links as `[spec]/[external]` — none were measured from our hardware in this session.

---

## Local SVG diagrams (already rendered in-repo)

- `docs/diagrams/architecture-overview.svg` — system boxes, MQTT/REST flow, run modes.
- `docs/diagrams/data-flow-pipeline.svg` — capture → corpus → training with KPI callouts.

Both are dark-theme, high-contrast, text-only-safe (no external fonts/network needed to view).