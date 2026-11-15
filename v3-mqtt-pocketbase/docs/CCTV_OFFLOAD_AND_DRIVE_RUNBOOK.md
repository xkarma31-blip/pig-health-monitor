# CCTV Offload + Google Drive Runbook

**Scope:** the camera → Pi → laptop → Google Drive pipeline, and what to do when
each link dies. All facts below were measured on the rig; commands are copy-paste
ready. Written 2026-11-16 after a barn power event.

---

## 1. The pipeline

```
Tapo C200C ──RTSP :554──► Pi (ffmpeg → /home/pigpulse/cctv/recs/seg_*.mp4)
                              │
                    hop1  rsync (hourly timer, laptop pulls)
                              ▼
                    laptop cache  /root/.cache/pigpulse-recs/
                              │
                    hop2  rclone upload + VERIFY, then delete local
                              ▼
                    Google Drive  gpdrive2:  (folder id 1Ws97O1jrhCmPkcxewIUp075SCvC8UaZo)
                              │
                    hop3  prune the Pi copy once it is verified safe
```

| Piece | Where |
|---|---|
| Offload script | `/root/.local/bin/pigpulse-recs-offload.sh` (root, laptop) |
| Unit / timer | `pigpulse-recs-offload.service` / `.timer` (hourly) |
| Recorder | `/home/pigpulse/cctv/rtsp_recorder.py` (Pi, systemd `pigpulse-rtsp-recorder`) |
| Recorder source of truth | `v3-mqtt-pocketbase/backend/cctv/rtsp_recorder.py` (repo → card) |
| rclone config | `/root/.config/rclone/rclone.conf` (`gpdrive`, `gpdrive2`) |

**The laptop is a pipe, not storage.** The Pi keeps 48 h, Drive keeps everything.

---

## 2. Google Drive quota — the 403 that looks like auth failure

### Symptom

```
Failed to create file system for "gpdrive:PigPulse/cctv-pi-recs":
couldn't find root directory ID: googleapi: Error 403: Quota exceeded for
quota metric 'Queries' ... RATE_LIMIT_EXCEEDED
  consumer: projects/202264815644
  quota_limit_value: 840000        # requests/min, SHARED
```

### Cause (measured)

The `gpdrive` remote has **no `client_id`** → it uses rclone's **public shared**
OAuth client. Every rclone user on earth shares that one Google Cloud project,
so its per-minute query quota is saturated at random. **The token is valid; the
project budget is not.** `invalid_grant` / `401` would be an auth failure — that
never appeared (0 occurrences across the whole outage).

The 403s land on **path resolution and destination listing**, not on file bytes —
which is why a 1 KB probe uploaded fine while 120 MB clips failed.

### Fix (in place, no Master action required)

1. **Address the folder by its Drive file ID** — a second remote `gpdrive2` in
   `rclone.conf` with `root_folder_id = 1Ws97O1jrhCmPkcxewIUp075SCvC8UaZo`.
   No "root directory ID" lookup, no parent-directory listing.
   Recreate it with:
   ```bash
   rclone config update gpdrive2 type drive token "$(rclone config show gpdrive | awk '/^token/{print $3}')" \
     root_folder_id 1Ws97O1jrhCmPkcxewIUp075SCvC8UaZo
   ```
2. **64 MiB upload chunks** (`--drive-chunk-size 64Mi`) → ~2 write calls per clip
   instead of ~15.
3. **Per-file retry passes** — one clip's 403 cannot abort the batch.
4. **VERIFY BEFORE DELETE** — a local clip is deleted only after Drive reports
   the same size (and MD5 when the API returns one).

### The bug this exposed

A storm-interrupted upload had left a **truncated object** on Drive
(`seg_20261116_005247.mp4` at 74,711,088 B while the real clip is 125,304,880 B).
rclone's `move` had kept the local source, but the old script trusted the copy
result rather than the object's size. Now the local copy survives until Drive
confirms it.

> **Invariant:** *a clip is removed from the laptop cache only after Drive
> reports the identical size (and MD5 when available).* Never `rclone move`.

### Optional hardening (needs Master)

Create a **own** OAuth client (Desktop app, External audience) for
`kuroyamimori746@gmail.com` → its own project quota → immune to the shared
client's saturation. Requires 2SV on that account first. **Optional now** — the
ID-rooted remote works without it.

---

## 3. Camera offline — triage

### Read the timeline from the Pi (this is the decisive evidence)

```bash
ssh pigpulse@192.168.69.1 'journalctl -u hostapd --no-pager | grep -i "18:69:45:fb:d4:be" | tail'
```

`STA 18:69:45:fb:d4:be ... associated` → `... disassociated` gives the exact
moment the camera left the AP. **2026-11-16 01:05:38** — and it never came back.

### Confirm it is really gone (not an IP change)

```bash
ssh pigpulse@192.168.69.1 '
  ip neigh show | grep -i 18:69:45:fb:d4:be || echo "MAC absent from ARP"
  for p in 554 2020 443 80; do timeout 4 bash -c "echo > /dev/tcp/192.168.69.2/$p" 2>/dev/null \
    && echo "port $p OPEN" || echo "port $p closed"; done'
```

`ARP FAILED` + every port closed + the MAC absent from the neighbour table =
the camera is **off the network** (power or its own link), not just re-IP'd.
A camera that changed IP would answer ARP for its MAC.

### Recovery at the barn

The camera runs **cardless** and is bound to the app account (see
`tapo-reset-rebind-runbook.md`). In order:

1. **Power** — check the camera's adapter and that the barn circuit is live.
   A power event is the usual cause: the Pi reboots on power restore, but the
   camera may sit dead if its adapter did not recover.
2. **Wi-Fi** — the camera should re-join the saved SSID `PigPulse` on boot.
   If it does not appear in `hostapd`, use the app flow: connect the phone to
   `PigPulse`, open the camera in the Tapo app, and re-issue the Wi-Fi switch.
3. **Verify** — `hostapd` shows `associated` again AND the Pi writes a new
   `seg_*.mp4`. The camera is judged by the dashboard feed (`/cctv`), never by
   the LED (CANON #18).

---

## 4. The Pi went down — triage

The 2026-11-15 05:01 "outage" was **power loss at the barn**, not a broken
cable: the Pi rebooted at 19:51:27 when power returned. The laptop's
`NO-CARRIER` on the USB-Ethernet link was a *symptom* of the dead Pi.

```bash
ssh pigpulse@192.168.69.1 'uptime -s'    # boot time = when power returned
```

If the Pi's boot time is recent, the Pi lost power — check the barn circuit
and consider a UPS. The Pi survives kernel hangs (its PHY stays up); a dead
DHCP lease plus a dead Tailscale peer means hard down.

---

## 5. Recorder invariant (do not break this)

`rtsp_recorder.py` polls every 15 s, so a crash is **never** detected as faster
than 15 s. The "fast exit" threshold must therefore sit **above** the poll
cadence:

```python
FAST_EXIT_S = int(os.environ.get("REC_FAST_EXIT_S", "60"))
```

At the old value of `10` the backoff was unreachable, `fast_exits` reset to 0 on
every crash, and a dead camera was respawned **every 15 s forever**
(9 min 53 s of CPU burned in 6.5 h). With the fix the recorder backs off
30 → 60 → 120 → 240 → 300 s and still recovers instantly when the camera
returns.

**Never set `REC_FAST_EXIT_S` below 15** — it would silently disable the
backoff again.

---

## 6. Health check (one screen)

```bash
systemctl list-timers pigpulse-recs-offload.timer --no-pager | head -3
journalctl -u pigpulse-recs-offload --no-pager -n 30 | grep -E 'hop2:|hop3:|done;'
rclone lsf --files-only --format sp gpdrive2: | wc -l     # Drive clip count
ssh pigpulse@192.168.69.1 'ls /home/pigpulse/cctv/recs/*.mp4 | wc -l; uptime -p; df -h / | tail -1'
```

Healthy: `hop2: ... uploaded+verified` for every clip, `hop3: ... deleted N
verified Pi clips`, Drive count growing, Pi clip count small (only the
in-flight segment), Pi uptime long.
