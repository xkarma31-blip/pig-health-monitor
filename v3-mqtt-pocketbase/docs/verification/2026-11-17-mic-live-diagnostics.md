# S3 mic live recovery and stale diagnostics fix — 2026-11-17

## 1. Stale diagnostics panel

The diagnostics page previously rendered an old S3 telemetry row as if current:
`mic reading false`, `rms/peak 0/0`, `telemetry age 32076.4 s`. That was honest
raw data presented without an honesty label.

`diag_state.py` now adds `state` and `note` to `esp` data:

- `NO TELEMETRY` when no payload has arrived
- `UNKNOWN AGE` when age is unavailable
- `STALE` when older than 60 s, with a human age and “not a live reading”
- `LIVE` only for fresh telemetry

The page shows a warning and suppresses old mic values unless state is `LIVE`.

Deployed with backup `/home/pigpulse/thermal-pi/diag_state.py.bak-<timestamp>`
and `pigpulse-thermal.service` restarted. Tests: `test_diag_state` 3/3 OK.

---

## 2. Measured live S3 mic

At 2026-11-17T17:03+08:00 after the radio-role correction:

```text
/esp/status:
connected=true, socket=true, stale=false, peer=192.168.69.15:56845
bytes=2,480,128, chunks=2239, non-zero=99.9%, signal=true, accepted=1

diag.json esp:
mic=true, rms=57219, peak=191490, sr=48000
rssi=-50 dBm, sps=48031, bps=96063, heap=178124, clip=0
age_s=0.9, state=LIVE

hostapd station dump:
Station 68:ee:8f:dd:31:3c (on wlan1)
```

A retained MQTT bootstrap message still contains `mic:false`; that is expected.
The live diagnostics subscriber receives fresh telemetry and now labels it
correctly.

**Conclusion:** the S3 mic recovered after the AP moved to the 2.4 GHz dongle.
It is not yet proven reliable long-term; recheck after every reboot per the
existing KNOWN_GOOD discipline.
