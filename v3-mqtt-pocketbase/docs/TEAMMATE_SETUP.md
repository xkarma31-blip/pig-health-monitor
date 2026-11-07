# PigPulse v3 — Teammate Access Guide

> **Rewritten 2026-11-07.** The previous version of this file told you to
> `docker compose up` a stack that no longer exists. The Pi runs **native
> systemd services**. If you followed the old guide, stop and read this one.
>
> **[measured]** means the value was read off the live hardware on 2026-11-07.
> Anything not marked that way is a plan, not a fact.

---

## 1. What you are accessing

A Raspberry Pi 4B at the barn running the entire edge stack. It is a
**standalone system** — it senses, stores and serves locally whether or not it
has internet. Internet only decides whether *you* can reach it.

| Piece | Address | Notes |
|---|---|---|
| Thermal + environment dashboard | `https://<pi>:8080` | **HTTPS only.** Self-signed cert — accept the warning once |
| Same dashboard, clean cert | `https://pigpulse-pi.tail2a25b0.ts.net` | Tailscale Serve + Let's Encrypt — **no warning** [measured] |
| PocketBase (database + API) | `http://<pi>:8090` | Admin UI at `/_/` — creds from Master |
| MQTT broker | `<pi>:1883` | WebSocket on `:9001` |
| SSH | `pigpulse@<pi>` | Key-based; send Master your public key |
| Camera relay | `127.0.0.1:8091` | Loopback only, proxied through the dashboard |
| ESP32-S3 audio ingest | TCP `:9090` | **DO NOT CONNECT** — single client, you will evict the barn mic |

`<pi>` is one of:

- **Remote:** `100.69.139.63` (or `pigpulse-pi` with MagicDNS)
- **On-site:** `192.168.69.1`

---

## 2. Remote access — Tailscale (recommended)

We share **only the Pi** with you. You do not join Master's tailnet and you
never see his laptop or phone. Revoking you is one click and affects nobody else.

**Be aware:** a node share grants **every port on the Pi**, not a subset. The
table in §1 is therefore a complete map of what you can reach — and §5 is what
keeps it from going wrong.

### What Master does (once per person)

1. Open <https://login.tailscale.com/admin/machines>
2. Find **`pigpulse-pi`** (`100.69.139.63`)
3. `⋯` menu → **Share** → enter your email → **Send**

### What you do (once, ~5 minutes)

1. Install Tailscale from <https://tailscale.com/download>
   (Windows, macOS, Linux, Android, iOS all work)
2. Sign in with the **same email** Master shared to
3. Open the invite email and **accept**
4. Confirm it works:

```bash
tailscale status          # pigpulse-pi should be listed
ping 100.69.139.63
```

5. Open the dashboard — two equivalent URLs:
   - <https://pigpulse-pi.tail2a25b0.ts.net> — **use this one.** Real Let's
     Encrypt certificate, no warning [measured]
   - <https://100.69.139.63:8080> — same page, self-signed cert; accept once

### Why not just a public link?

Because it would put the barn's database and shell on the open internet.
Tailscale gives the same convenience with an identity check and no open ports.
If Master later wants a view-only public URL for demos, that is a separate,
deliberate decision.

---

## 3. On-site access — no Tailscale needed

1. Join WiFi **`PigPulse`** (2.4 GHz, channel 6). Password: ask Master.
2. Everything is then at `192.168.69.1` — same ports as the table above.

The AP exists so the camera and the ESP32-S3 can talk to the Pi. It has no
internet of its own unless an uplink is attached (see §6).

---

## 4. Repository access

| Remote | URL |
|---|---|
| GitHub (mirror) | `github.com/xkarma31-blip/pig-health-monitor` |
| Codeberg (origin) | `codeberg.org/Solrahk/pig-health-monitor` |

- Working branch: **`feat/v3-mqtt-pocketbase`**
- Start with **`CANON.md`** at the repo root. It is the source of truth for
  topology, paths and hard rules. `v3-mqtt-pocketbase/docs/` is secondary.

Most help needs **read-only** repo access plus the dashboard. You do not need
SSH to review code, file issues, or propose a patch.

---

## 5. Rules of engagement

The Pi is a live edge device, not a dev box. These are the things that break it:

| Don't | Why |
|---|---|
| Connect to TCP `:9090` | Single-client socket. Your connection evicts the barn microphone |
| Write to PocketBase collections | `create` rules are currently open (`""`) — you *can* write, so don't. Test data pollutes the ML corpus |
| Edit or vacuum `soak.db` | It is the hardware evidence log and is being appended to continuously |
| Restart/stop `pigpulse-*` units | The recorder and soak collector lose data mid-write |
| Touch `hostapd` / `dnsmasq` / `wlan0` config | This is the AP. A mistake drops the camera and the ESP32 with no obvious cause |
| Run `apt upgrade` | The Pi boots from an SD card; a kernel update can strand it with no console |
| Run schema migrations | Schema changes require a matching migration file — see `CANON.md` §2.3 |

Safe to do: read logs, run diagnostics, read the DB, query MQTT, copy files out.

```bash
# read-only diagnostics that are always safe
journalctl -u pigpulse-bridge -n 50 --no-pager
journalctl -u pigpulse-soak  -n 50 --no-pager
systemctl list-units 'pigpulse*' --no-pager
ss -lnt
curl -s http://127.0.0.1:8090/api/health
```

---

## 6. The uplink caveat — read this before reporting the Pi "down"

The Pi only appears on Tailscale **while it has internet**. Today that internet
comes from Master's laptop over a USB tether (Pi `eth1` → laptop `10.42.0.1`).

Consequences:

- Laptop away or asleep → the Pi keeps recording, but **you cannot reach it**.
- In the field, any upstream works: ethernet into `eth0`, or a phone
  USB-tethered to the Pi. `pigpulse-router.service` already forwards and NATs it.
- Verify from the Pi itself:

```bash
ping -c1 1.1.1.1        # does the Pi have internet right now?
ip route show default   # which interface is carrying it?
tailscale status        # is it logged in and connected?
```

If `ping 1.1.1.1` fails, nothing you do on your laptop will fix remote access.
The Pi needs an uplink first.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Dashboard blank / connection refused | You used `http://` | Use **`https://`** on port 8080 |
| Certificate warning | Self-signed cert | Accept it once |
| `ping 100.69.139.63` times out | Pi offline, or share not accepted | Check `tailscale status`; ask Master |
| SSH permission denied | Your key is not installed | Send Master your `~/.ssh/id_ed25519.pub` |
| 8090 answers but dashboard does not | Only the dashboard is HTTPS | Expected — PocketBase is plain HTTP |
| Everything works, no new data | Sensors stopped, not the network | Check `pigpulse-bridge` and `pigpulse-thermal` journals |

---

## 8. Granting and revoking (Master)

**Share:** admin console → Machines → `pigpulse-pi` → Share → email.
**Revoke:** same menu → remove the share. No password change needed.

**Add an SSH key:**

```bash
ssh pigpulse@100.69.139.63 \
  'echo "ssh-ed25519 AAAA... teammate@laptop" >> ~/.ssh/authorized_keys'
```

**Remove it:**

```bash
ssh pigpulse@100.69.139.63 \
  "sed -i '/teammate@laptop/d' ~/.ssh/authorized_keys"
```

**Known posture issues (not fixed as of 2026-11-07):**

- SSH password authentication is **enabled**, and the `pigpulse` account is in
  `sudo` with the same password as the WiFi AP. Anyone who can join the AP can
  become root. Fix: key-only SSH, and a separate sudo password.
- PocketBase `create` rules are open on all five base collections, so any
  reachable client can insert rows. Fix: lock `create` and give the ESP32 and
  bridge a service token.
- `pigpulse-cctv` is in a restart loop (`ffmpeg` exits immediately, zero
  frames) as of 2026-11-07. The camera answers ping at `192.168.69.2`.
