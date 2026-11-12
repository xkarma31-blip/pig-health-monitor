#!/bin/bash
# HOT TEST: bring the uplink up while the AP is live and serving clients.
# Proves the freq-pinned association does not move the radio.
MARK=$(date '+%F %T')
c() { hostapd_cli -p /var/run/hostapd -i wlan0 all_sta 2>/dev/null | grep -cE '^([0-9a-f]{2}:){5}'; }
apf() { hostapd_cli -p /var/run/hostapd -i wlan0 status 2>/dev/null | sed -n 's/^freq=//p'; }
stf() { iw dev wlan0sta info 2>/dev/null | sed -n 's/.*(\([0-9]*\) MHz).*/\1/p'; }

echo "════ BEFORE ════"
echo "  clients: $(c)"
echo "  ap: $(hostapd_cli -p /var/run/hostapd -i wlan0 status 2>/dev/null | grep -E '^state=|^freq=' | tr '\n' ' ')"
echo "  defaults: $(ip route | grep '^default' | tr '\n' ' ')"
echo
echo "════ BRING THE UPLINK UP ════"
/usr/local/sbin/pigpulse-wan-sta-up 2>&1 | sed 's/^/  /'
echo
echo "════ AFTER (immediately) ════"
echo "  status : $(cat /run/pigpulse/wan-sta.status 2>/dev/null)"
echo "  clients: $(c)"
echo "  ap     : $(hostapd_cli -p /var/run/hostapd -i wlan0 status 2>/dev/null | grep -E '^state=|^freq=' | tr '\n' ' ')"
iw dev wlan0sta info 2>/dev/null | grep -E 'channel|type' | sed 's/^/  sta: /'
ip -4 -o addr show wlan0sta 2>/dev/null | awk '{print "  addr: "$4}'
ip route | grep '^default' | sed 's/^/  rt: /'
echo
echo "════ WATCH 30s (clients must stay >= 1) ════"
for i in 1 2 3 4 5 6; do
  sleep 5
  echo "  +$((i*5))s clients=$(c) ap_freq=$(apf) sta_freq=$(stf)"
done
echo
echo "════ HOSTAPD LOG SINCE TEST START ════"
journalctl -u hostapd --since "$MARK" --no-pager | tail -12
echo
echo "════ INTERNET VIA THE UPLINK INTERFACE ONLY ════"
timeout 12 ping -c 2 -I wlan0sta 8.8.8.8 2>&1 | tail -3 | sed 's/^/  /'
timeout 20 curl -s --interface wlan0sta --max-time 15 https://api.ipify.org 2>&1 | sed 's/^/  public-ip: /'
echo
echo "  primary route still: $(ip route get 8.8.8.8 2>/dev/null | head -1)"
