# PigPulse Wi-Fi uplink (APSTA at boot)

**What this is:** the Pi's single Wi-Fi radio (`brcmfmac`) serving the barn AP *and*
connecting to an upstream Wi-Fi network at the same time — so the unit can run with
no laptop tether and no cable.

---

## The one hard limit you must know

```
#{ managed } <= 1, #{ AP } <= 1, #{ P2P-client } <= 1, #{ P2P-device } <= 1,
total <= 4, #channels <= 1
```

`#channels <= 1` means **the AP and the uplink are forced onto the same channel**.

- If the upstream network is a **2.4 GHz** network on the **same channel as the AP
  (ch 6)**, this mode works.
- If the upstream is **5 GHz**, the AP is dragged onto 5 GHz and the 2.4 GHz-only
  ESP32-S3 mic and Tapo CCTV can never join. There is no configuration that fixes
  that on one radio; it needs a second adapter.

Measured 2026-11-12: a station vif without a frequency restriction hopped the PHY to
5620 MHz (ch 124) and dropped all 3 AP clients, then wedged the firmware on teardown
(`brcm_cfg80211_stop_ap: setting AP mode failed -52`), silencing the AP until reboot.

## How this avoids that

1. `pigpulse-wan-sta.service` runs **before** `hostapd.service`.
2. `wpa_supplicant` is pinned to one BSSID **and** one frequency (global
   `freq_list` / `scan_freq` = the AP's channel), so no scan can move the radio.
3. A channel guard aborts the uplink if the station landed on a different channel
   than the AP is configured for.
4. Every failure path tears the station vif down and exits 0 — **the AP always wins**.

## Three phases, and why the boot path never scans

| Phase | When | Scans? |
|---|---|---|
| `--plan` | before hostapd | no — writes `hostapd.conf` from the saved venue |
| `connect` (default) | before hostapd | **no** — associates from the saved BSSID + freq |
| `--discover` | from the onboarding portal, AP **down** | yes — the only phase that scans |

**Measured 2026-11-12: a scan at boot is a coin flip.** `iw scan freq 2412…2472`
returned 1 BSS on one cold boot and 0 BSS on ten consecutive attempts on the
next — both times with the phy parked on 5 GHz ch 34 and **no error reported**.
`iw dev … set channel` is refused (`-95`) while a vif is up, so the phy cannot be
parked by hand either. brcmfmac simply rejects chanspec work for the first ~20 s
after power-on.

Association does not need that scan. With `bssid=` + `scan_freq=` + a **global**
`freq_list`, `wpa_supplicant` issues the connect for that exact BSSID on that
exact frequency. Measured: **`wpa_state=COMPLETED` in 2 s with `scans: 0`**, and
two consecutive cold boots associated 7–8 s after vif-up.

Consequences:

- **No saved venue → no uplink attempt at all** (`OFF no-saved-venue`). The AP
  stays on its base channel and the portal owns discovery, where it runs with
  the AP deliberately down and the radio warm.
- `freq_list` must be **global**. Inside a `network={}` block it is silently
  ignored, and the firmware then picks another BSS of the same SSID — measured:
  it chose the venue's 5 GHz BSSID and the association collapsed.

## Files

| Path | Role |
|---|---|
| `/etc/pigpulse/wan-sta.enabled` | master switch; absent = mode off |
| `/etc/pigpulse/wan-sta.ssid` / `.bssid` / `.freq` | the saved venue profile |
| `/usr/local/sbin/pigpulse-wan-sta-up` | the bring-up logic (`--plan` / default / `--discover`) |
| `/usr/local/sbin/pigpulse-wan-sta-status` | `pigpulse-wan-sta-status` one-screen report |
| `/etc/wpa_supplicant/wpa-pigpulse-uplink.conf` | rendered uplink config (mode 600) |
| `/etc/systemd/system/pigpulse-wan-sta.service` | oneshot, before hostapd |
| `/etc/systemd/system/hostapd.service.d/20-wan-sta-order.conf` | ordering |
| `/var/log/pigpulse-wan-sta.log` | per-boot trace |
| `/run/pigpulse/wan-sta.status` | `UP …` or `OFF <reason>` |
| `/usr/local/sbin/pigpulse-portal-connect` | applies a venue chosen in the portal |
| `/run/pigpulse/ap-hold` | **deliberate AP outage marker** — see below |
| `/run/pigpulse/portal-result.json` | outcome the onboarding page polls |

## The `ap-hold` contract (do not skip this)

`pigpulse-ap-watchdog.timer` fires every ~30 s and restarts hostapd when it
thinks the radio is degraded. Measured 2026-11-12: it brought the AP back **4 s
after `systemctl stop hostapd`**, in the middle of an association, and every
portal connect then timed out at 90 s.

So any code that intentionally stops the AP must:

```bash
touch /run/pigpulse/ap-hold     # watchdog exits 0 immediately
systemctl stop pigpulse-ap-watchdog.timer
systemctl stop hostapd
# ... do the radio work ...
rm -f /run/pigpulse/ap-hold
systemctl start pigpulse-ap-watchdog.timer
```

`pigpulse-portal-connect` does exactly this and installs an `EXIT`/`INT`/`TERM`
trap, so a crash cannot leave the AP held down. `pigpulse-ap-watchdog.sh` lines
after `set -u`:

```bash
if [ -e /run/pigpulse/ap-hold ]; then exit 0; fi
```

## Operate

```bash
pigpulse-wan-sta-status            # what is it doing right now
journalctl -u pigpulse-wan-sta -b  # boot trace
```

**Pick or change the venue** — browse to `http://192.168.69.1/` on the hotspot
(or `http://<pi-tether-ip>/`). The onboarding card is the first page. Connect is
asynchronous: the page is answered *before* the radio moves, then it polls
`/api/connect-result`. A failed attempt restores the **previous venue and
uplink**, not merely the AP config.

```bash
# what can the radio actually see? (AP must be down; refuses otherwise)
sudo systemctl stop hostapd && sudo pigpulse-wan-sta-up --discover
```

Output is one line per BSS: `<band> <freq> <signal> <ssid>`.

**Enable / disable** — always by flag + reboot, never by `systemctl stop`:

```bash
sudo touch /etc/pigpulse/wan-sta.enabled && sudo reboot    # enable
sudo rm /etc/pigpulse/wan-sta.enabled && sudo reboot       # disable
```

`systemctl stop` is intentionally unsupported: tearing the station vif down while the
AP is live wedges the firmware. The vif simply disappears on reboot.

## Routing rule

`dhcpcd -R` gets the address but installs **no** default route. The script adds

```
default via <farm-gw> dev wlan0sta metric 200
```

so the USB tether (`eth1`, metric 100) always stays primary while it is plugged in.

## Pi's own resolver

The Pi resolves through **its own dnsmasq** (`nameserver 127.0.0.1`), not through
NetworkManager. NetworkManager used to write the *current default route's* DNS
into `/etc/resolv.conf`, so unplugging the laptop tether left `nameserver
10.42.0.1` behind and the Pi lost DNS even with the Wi-Fi uplink up (measured
2026-11-12). Fixed by:

- `/etc/NetworkManager/conf.d/90-dns-none.conf` → `dns=none`
- `/etc/resolv.conf` → static `nameserver 127.0.0.1` (written by `install.sh`)
- dnsmasq upstreams → `/etc/pigpulse/wan-resolv.conf`, rewritten on every
  attempt with **venue DNS first, then tether, then 1.1.1.1 / 8.8.8.8**

`merge_resolv()` skips loopback addresses, because dnsmasq reads that file as
its *upstream* list — `127.0.0.1` there would make it query itself forever.

## DHCP recovery and honest status

A failed attempt previously left `169.254.134.112/16` behind. On this Pi,
`dhcpcd -k wlan0sta` did not remove it; a later association succeeded but DHCP
returned without a usable lease. Flushing the address made the same attempt
work. Teardown now flushes station IPv4 addresses, acquisition clears stale
IPv4LL, and `--noipv4ll` disables that unusable fallback.

Starting hostapd also briefly drops station carrier. The 2026-11-12 journal
shows the restored lease at 20:27:50, four seconds after the old worker had
published its result. The worker now waits up to 20 seconds for association,
a non-link-local address and a default gateway after starting the AP. A new
venue that fails this check triggers restoration of the previous venue.

The portal checks live association and IPv4 state rather than trusting a
historical `UP` file: `DOWN link-lost` means no association; `DOWN no-dhcp`
means association without a usable address. Its `internet` probe follows the
system route (possibly the tether), so it alone does not prove Wi-Fi WAN.
The `ap.clients` field counts DHCP leases, not necessarily connected stations.

Live retest 2026-11-12, after this change: real venue returned success with
`192.168.254.194` already present; a bogus SSID timed out, then restored the
previous association, lease and both default routes before returning failure.
`ping -I wlan0sta 8.8.8.8` received 3/3 replies; HTTPS bound to `wlan0sta`
returned 200. `iw dev wlan0 station dump` showed two associated stations
(including the ESP32-S3), versus four retained DHCP leases. These are spot
checks, not a long-term reliability claim.

Pi archives (root-only, contain configuration secrets):

- Before this recovery change: `/root/pigpulse-backups/recovery-20261112-203900/`
- Tested files, package list, service configs and live evidence:
  `/root/pigpulse-backups/recovery-tested-20261112-204246/`

Rollback the recovery change from a root shell on the Pi (does not interrupt
the running AP or station; the old worker takes effect on the next attempt):

```bash
bk=/root/pigpulse-backups/recovery-20261112-203900
install -m 755 "$bk/pigpulse-portal-connect" /usr/local/sbin/pigpulse-portal-connect
install -m 755 "$bk/pigpulse-wan-sta-up" /usr/local/sbin/pigpulse-wan-sta-up
install -m 755 "$bk/portal.py" /usr/local/lib/pigpulse-portal/portal.py
systemctl restart pigpulse-portal
```

Offline regressions (from the repository root):

```bash
python3 -m unittest discover -s v3-mqtt-pocketbase/backend/portal -v
bash -n v3-mqtt-pocketbase/backend/portal/pigpulse-portal-connect
bash -n v3-mqtt-pocketbase/deploy/wan-apsta/pigpulse-wan-sta-up
```

## Known follow-ups

- **A 5 GHz venue still needs a second radio** (a working AR9271/`ath9k_htc`, or
  MT7612U/`mt76`). The RTL8188CUS dongle on hand is RF-dead (`usbctrl_vendorreq
  TimeOut`, 0 BSS, 0 RX/TX bytes) and the AR9271 sample never enumerates.
- **No automatic retry, by design.** The boot path attempts the **saved venue
  only**; with no saved venue it writes `OFF no-saved-venue` and leaves the AP
  alone. Re-associating while the AP is live bumps every AP client, so
  discovery and retry belong to the portal, where the AP is down on purpose.
- **Re-association costs a blip.** Measured: when the station associates while clients are
  connected, brcmfmac drops the AP's associations once. At boot this is free (no clients
  yet); if the uplink flaps later, expect a short client bump per recovery.
