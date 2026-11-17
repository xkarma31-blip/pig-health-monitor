#!/bin/sh
# Best-effort radio power-save helper for the Pi's AP interface.
#
# Why this exists: the 2026-11-17 radio-role swap moved the PigPulse AP from
# the onboard wlan0 to a USB RTL8188CUS dongle (rtl8192cu) on wlan1. The old
# unit called `iw dev wlan1 set power_save off` at boot and failed twice:
#   1. it ran before the USB device enumerated (No such device, -19);
#   2. rtl8192cu exposes no power-management module parameter (only
#      debug_level, debug_mask, swenc) and rejects the iw call with
#      Operation not supported (-95).
# So: wait for enumeration, try both radios, log the real state, and always
# succeed — a driver limitation must never fail the boot again.
i=0
while [ "$i" -lt 30 ] && [ ! -d /sys/class/net/wlan1 ]; do
  i=$((i + 1))
  sleep 1
done
[ -d /sys/class/net/wlan1 ] || echo "wlan1 not enumerated after 30s"

for radio in wlan1 wlan0; do
  [ -d "/sys/class/net/$radio" ] || continue
  /sbin/iw dev "$radio" set power_save off 2>/dev/null || \
    echo "$radio: iw power_save off unsupported (driver limitation)"
done
for radio in wlan1 wlan0; do
  [ -d "/sys/class/net/$radio" ] || continue
  echo "$radio: $(/sbin/iw dev "$radio" get power_save 2>/dev/null)"
done
