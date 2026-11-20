# Radio role correction and 5 GHz scan verification — 2026-11-17

**Status:** historical record; applied live, reversible, measured on 2026-11-17.

> **Historical topology only.** The interface names and radio-role assignment
> recorded below describe the Pi state measured on 2026-11-17. A later device
> readout (2026-11-20) measured the AP/client radio MAC as
> `dc:a6:32:87:63:a1` and the managed/WAN radio MAC as
> `00:1f:05:6c:51:bc`; the radio may still resolve to `wlan0` or `wlan1`, and
> the managed radio may still be `DOWN`. Current consumers therefore resolve
> the measured roles by MAC through `/usr/local/sbin/pigpulse-wlan-iface` and
> never infer identity from an interface name or link state. The measurements
> below are retained unchanged as evidence of what was true on 2026-11-17.

---

## 1. Problem

Portal copy described the intended topology — built-in dual-band radio as WAN
client, USB dongle as 2.4 GHz barn AP — but every deployed script assigned the
opposite roles. `/api/scan` therefore used the 2.4 GHz-only dongle and could not
see the user's 5 GHz hotspot.

Measured before:

```text
wlan0 = dc:a6:32:87:63:a1 (brcmfmac, built-in) → AP 192.168.69.1/24, ch 6
wlan1 = 00:1f:05:6c:51:bc (rtl8192cu, USB)     → WAN 192.168.254.113/24
/api/scan → only GFiber_E9BD4 2.4 GHz
```

---

## 2. Applied change

- `portal.py`: `WAN_RADIO_MAC = dc:a6…`, `AP_RADIO_MAC = 00:1f…`
- `pigpulse-ap-resolve` / `pigpulse-ap-static-ip`: AP follows the dongle MAC
- `pigpulse-uplink-apply`: WAN follows the built-in MAC
- `pigpulse-portal-connect` and `pigpulse-wan-sta-up`: resolve interfaces by MAC,
  no hardcoded `wlan0sta` / `wlan0`
- `pigpulse-wan-pick`: prefer 5 GHz when both bands are visible, fall back to 2.4
- `pigpulse-wan-sta-up`: AP remains on its 2.4 GHz base config regardless of WAN band
- `portal.py`: use absolute `/sbin/iw`; accept 5 GHz connect requests

Rollback: `/usr/local/sbin/rollback-radio-roles.sh <backup-dir>` restores every
changed live file and restarts the radio-facing services.

Backup: `/root/pigpulse-backups/radio-roles-20261117-161319`

---

## 3. Measured after

```text
wlan0 = 192.168.254.126/24 (built-in, WAN client)
wlan1 = 192.168.69.1/24 (dongle, AP)
hostapd.conf interface=wlan1, hw_mode=g, channel=6
dnsmasq.conf interface=wlan1
wan-sta.status: STATE=UP band=24 ip=192.168.254.126 gw=192.168.254.254 wan=wlan0
```

`curl http://192.168.69.1/api/scan?force=1` at 2026-11-17T16:19+08:00:

```json
{
  "networks": [
    {"ssid":"solrahK","band":"5G","freq":5180,"signal":-34.0},
    {"ssid":"GFiber_E9BD4","band":"24","freq":2462,"signal":-44.0},
    {"ssid":"GFiber_E9BD4","band":"5G","freq":5180,"signal":-48.0}
  ]
}
```

The Pi's own PigPulse AP BSSID is filtered from the upstream list.

---

## 4. Phone-hotspot association test (partial)

With Ethernet default route temporarily removed, the Pi scanned the phone
hotspot `solrahK` on 5 GHz and two portal connect attempts were made with fresh
BSSIDs. Both failed to associate. Supplicant logs showed it selecting the
`solrahK` BSSID but receiving `ASSOC-REJECT status=16` on a different 5 GHz BSS
(`2c:b6:c2:1e:9b:d5`, GFiber). A manually pinned BSSID config was also tried;
the hotspot dropped before association completed, so the result is inconclusive.

The AP and Ethernet default route were restored after testing. The 5 GHz scan
path itself is proven; Pi-to-phone-hotspot association remains **unverified**.

---

## 5. Gates

- `python3 -m unittest test_portal -v` — 15 tests OK
- `test-pick.sh` — 9/9 pass, including “both bands → 5 GHz wins”
- `npm run ci:backend` — backend OK
- `critic_loop.sh` — passed on changed Python, shell, and Bash files; extensionless
  deployed scripts have no critic rules
- CodeRabbit attempted; still unavailable (`cr: command not found`)
