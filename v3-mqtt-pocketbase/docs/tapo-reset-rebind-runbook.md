# Tapo C200C — Factory Reset + Rebind Runbook (2026-10-21)

**Why:** the camera's recorder stopped writing at clip tp00085 (~10 h of blank
shells since), the record plan is event-mode (not the 24/7 we want), and every
management function sits behind a cloud credential owned by a friend's account.
A factory reset + rebind to Master's own TP-Link account fixes all three at
once: fresh recorder state, our credential for the local API (24/7 arming,
offload, playback), and a usable app.

**What survives the reset:** nothing on the camera (WiFi, camera account, cloud
binding, record plan — all wiped). The SD card's 86 archived clips are safe on
the laptop (backend/recordings/sdcard-archive-20261021/).

**Do not reinsert the SD card until Phase 4.** The camera will want to format
it; the archive must be complete first (confirmed by Solrahk/opencode).

---

## Phase 0 — pre-flight (opencode, done before you start)

- [x] Archive of the 86 valid clips complete on the laptop
- [ ] opencode confirms the card can be formatted

## Phase 1 — factory reset (barn, ~2 minutes)

1. Camera powered ON, SD card **out** (it is — card is in the laptop).
2. Rotate the lens **upward** — the reset button sits on the base next to the
   microSD slot.
3. Press and **hold** the reset button ~5–10 s until the camera chimes and
   restarts (the status light blinks red).

## Phase 2 — bind to YOUR account (needs internet WiFi, ~10 minutes)

The camera needs real internet for setup only. The PigPulse AP has none, so
use the **phone's hotspot** (mobile data on) as the setup WiFi:

1. Phone: enable mobile data, then enable **hotspot** (note the SSID/password).
2. Tapo app → **+** → add device → choose the camera.
3. When the app asks to connect to the camera's network: allow it (Android
   hands the WiFi over).
4. At the WiFi-selection screen, look for **your hotspot's own SSID** in the
   scan list and select it, enter the hotspot password.
   - If the hotspot SSID does not appear in the list, use the fallback:
     complete setup on any internet WiFi (e.g. home router), then move the
     camera to the barn and do the "reconnect to a different network" flow
     from the PigPulse WiFi (Phase 3 covers it).
5. **Log in / bind with `kuroyamimori746@gmail.com`** — the camera is now
   *yours*.

## Phase 3 — in-app configuration (same creds as the rig, ~5 minutes)

While still in the app with the camera online:

1. **Camera Account** (⚙️ → Advanced Settings → Camera Account):
   user `pigpulse`, password `capstone` — **exactly these**, so the Pi's
   RTSP pipeline (`tapo_mjpeg_server.py`, fusion page) never blinks.
2. **ONVIF** (⚙️ → Advanced Settings → ONVIF): enable, port 2020.
3. **WiFi → PigPulse** (⚙️ → WiFi or "reconnect to another network"):
   SSID `PigPulse`, passphrase `capstone`. The camera will leave the
   hotspot and join the barn AP.
4. Phone: switch WiFi back to **PigPulse**. The camera will show **Offline**
   in the app (it has no internet — expected, permanent) but the app's local
   live view works, and the fusion page keeps streaming.

## Phase 4 — card back in + 24/7 (barn, ~3 minutes)

> ⚠️ **Do NOT reuse the old card.** It is dying — kernel-confirmed FAT read
> failures and write-refusing sectors (the cause of the blank-file wedge).
> Phase 4 requires a **new high-endurance microSD** (SanDisk Max Endurance /
> Samsung PRO Endurance, 64–128 GB) — continuous writing is exactly what
> kills ordinary cards.

1. Tell opencode — it arms 24/7 continuous + circular recording via the local
   API (this now authenticates with `kuroyamimori746`'s own password) and
   verifies by read-back, then fills `~/.config/pigpulse/tapo.env` so the
   hourly offload activates.
2. Camera **unplugged** → insert the SD card → power on.
3. The camera formats the card fresh and starts recording per the armed plan.
4. opencode verifies from here: stream alive, clips appearing in the record
   list, offload pulling.

---

## Rollback / failure notes

- Setup WiFi step fails repeatedly → do the bind on any home/internet WiFi,
  travel the camera to the barn, then in the app: device offline →
  "reconnect to a different network" → PigPulse (phone on PigPulse).
- Camera won't join PigPulse → it enters AP-recovery (broadcasts `Tapo_...`):
  re-run the WiFi switch from the app; nothing is lost.
- Fusion page shows "CCTV offline" after the move → wait ~60 s (auto-
  reconnect retries every 3 s), then reload the page once.
