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

## LED status decoder (and what NOT to trust it for)

- **Solid red** — booting. Stays red >30 s = **app wedged** (what the full/corrupt
  SD card caused on every card-in).
- **Blinking red + green** — setup mode, waiting for app pairing.
- **Blinking green** — joining WiFi.
- **Solid green** — Tapo cloud reachable + device registered. Cosmetic for us.
- **Solid amber (orange)** — WiFi fine, Tapo cloud unreachable. **Expected in
  the barn topology; harmless.** At distance/dim light amber reads as red.

**Ground truth rule: judge the camera by the dashboard feed (`/cctv`), never by
the LED.** The LED cannot be read remotely (no cloud API available — CANON #18;
Pi has no conntrack table to enumerate outbound links). If the picture moves on
`/cctv`, the camera app is alive regardless of light color.

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
5. **Log in / bind with the Tapo app's own account** — whatever the phone app
   is signed into (2026-11-03: the owner turned out to be the account on the
   app at bind time, **NOT** `kuroyamimori746@gmail.com` — that Gmail is only
   the Google Drive storage account).

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
   API. **Important (2026-11-03 measured):** the local API authenticates with
   the **Tapo app account password** (cloud-bound at rebind), NOT the camera
   account's password (`pigpulse`/`capstone` is RTSP-only now). On success it
   verifies by read-back and fills `~/.config/pigpulse/tapo.env` so the
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

---

## 2026-11-03 update — old card retired; camera runs cardless

Autopsy of the original SD card (read on the Pi's USB card reader, mounted
**read-only**, 235 files):

- **100% FULL:** 63G used of 63G (613 MB free) — the card had no room at all,
  which is why every card-in wedged the camera app at boot.
- **FAT directory damage:** 96 of 235 names are mangled (`xxxxxxxx_000000_tp00NNN.mp4`), newest entries all share one frozen mtime
  (2026-09-22 23:33). Sample reads still succeed — the read side is
  intermittently healthy; the filesystem metadata is not trustworthy.
- **Nothing recorded after 2026-09-24.** The 2026-10-21 laptop archive
  (99 files, 25G, clips tp00000–tp00085 + .pic frames) already covers the
  usable history.
- **Decision (final):** card stays OUT of the camera. Cardless operation is
  proven stable (feed uninterrupted for hours; relay watchdog recovers any
  stall within ~15 s). Replacement when ready: new high-endurance card
  (SanDisk Max Endurance / Samsung PRO Endurance, 64–128 GB).
  ~150 pre-Oct-21 chunks (38G) remain unarchived on the card itself — copy
  them off the Pi reader only if Master wants the extra raw footage.
