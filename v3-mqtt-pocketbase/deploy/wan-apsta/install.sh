#!/bin/bash
# Install the optional APSTA-at-boot Wi-Fi uplink. Does NOT enable the mode.
#
#   ./install.sh <source-dir> [ssid] [preferred-bssid]
#
# The venue SSID and a preferred (not required) BSSID are read at every boot
# from /etc/pigpulse/wan-sta.ssid and /etc/pigpulse/wan-sta.bssid.
set -uo pipefail
TS=$(date +%Y%m%d-%H%M%S)
BK="/root/pigpulse-backups/wan-sta-boot-$TS"
SRC="${1:-/tmp/wsta}"
SSID="${2:-${PIGPULSE_UPLINK_SSID:-GFiber_E9BD4}}"
PREFBSSID="${3:-2c:b6:c2:1e:9b:d4}"
log() { echo "[$(date +%H:%M:%S)] $*"; }

[ "$(id -u)" = 0 ] || { echo "must run as root"; exit 1; }
[ -d "$SRC" ] || { echo "source dir $SRC missing"; exit 1; }

# ---------------------------------------------------------------- backup
mkdir -p "$BK" || exit 1
cp -a /etc/hostapd/hostapd.conf "$BK"/ 2>/dev/null
cp -a /etc/NetworkManager/conf.d "$BK"/ 2>/dev/null
cp -a /etc/dnsmasq.conf "$BK"/ 2>/dev/null
cp -a /etc/pigpulse "$BK"/ 2>/dev/null
systemctl list-unit-files > "$BK"/unit-files-before.txt 2>/dev/null
ip route show > "$BK"/ip-route-before.txt
echo "$BK" > /root/pigpulse-backups/LATEST-WAN-STA
log "backup -> $BK"

# ---------------------------------------------------------------- programs
install -m 755 "$SRC"/pigpulse-wan-sta-up     /usr/local/sbin/pigpulse-wan-sta-up
install -m 755 "$SRC"/pigpulse-wan-sta-status /usr/local/sbin/pigpulse-wan-sta-status
install -m 755 "$SRC"/pigpulse-wan-pick       /usr/local/sbin/pigpulse-wan-pick
log "programs installed (up, status, pick)"

# ------------------------------------------------------- pristine AP config
# hostapd.conf becomes generated output: the runner rebuilds it from .base on
# every boot so the AP can follow the venue's channel. Created once, never
# overwritten afterwards — so a hand-edited base survives reinstall.
if [ ! -e /etc/hostapd/hostapd.conf.base ]; then
  cp -a /etc/hostapd/hostapd.conf /etc/hostapd/hostapd.conf.base
  log "hostapd.conf.base created from the current AP config"
fi
CH=$(sed -n 's/^channel=//p' /etc/hostapd/hostapd.conf.base 2>/dev/null | head -1)
[ -n "${CH:-}" ] || { echo "ABORT: cannot read base AP channel"; exit 1; }
FREQ=$((2407 + CH * 5))

# ------------------------------------------------------------ credentials
[ -r /root/farm_psk ] || { echo "ABORT: /root/farm_psk unreadable"; exit 1; }

# wpa_supplicant accepts either an 8..63 char passphrase or the 64-hex
# PBKDF2 key. Derive the key so the config carries no plaintext passphrase
# and no quoting pitfalls.
PSK=$(cat /root/farm_psk)
case ${#PSK} in
  8|9|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9]|6[0-3]) : ;;
  *) echo "ABORT: passphrase length ${#PSK} is outside 8..63"; exit 1 ;;
esac
PSK64=$(printf '%s\n' "$PSK" | wpa_passphrase "$SSID" 2>/dev/null \
        | sed -n 's/^[[:space:]]*psk=//p' | head -1)
unset PSK
case ${#PSK64} in
  64) : ;;
  *) echo "ABORT: key derivation failed (got ${#PSK64} chars)"; exit 1 ;;
esac

# The template is rendered at every boot with the BSSID and frequency that the
# scan actually found, so the uplink follows the venue instead of a hard-coded
# access point. Placeholders are the only thing that changes.
mkdir -p /etc/wpa_supplicant /etc/pigpulse
umask 077
cat > /etc/pigpulse/wpa-uplink.tmpl <<EOF
# PigPulse upstream Wi-Fi TEMPLATE — rendered by pigpulse-wan-sta-up.
# PSK stored hex-encoded (no quoting surprises). @BSSID@ / @FREQ@ are filled
# from the scan: one BSSID and ONE frequency, because the AP and the station
# must share a channel on this single radio.
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=0
# ap_scan=1 with scan_freq/freq_list pinned: the scan is limited to one channel
# and yields a real BSS entry, so the association carries a BSSID. ap_scan=2 was
# tried and reverted: it sends no BSSID, the firmware then picks the venue's
# 5 GHz BSS, and that drags the shared radio off the AP's channel.
ap_scan=1
disable_scan_offload=1
country=PH
# GLOBAL freq_list: inside a network block this option is silently ignored, and
# without it the firmware picks whichever BSS of the SSID it likes — measured
# 2026-11-12: it chose the venue's 5 GHz BSSID and the association collapsed.
freq_list=@FREQ@

network={
	ssid="$SSID"
	bssid=@BSSID@
	scan_freq=@FREQ@
	key_mgmt=WPA-PSK
	ieee80211w=0
	psk=$PSK64
}
EOF
chmod 600 /etc/pigpulse/wpa-uplink.tmpl
umask 022

# Seed a usable config right now (the boot runner overwrites it with the BSSID
# it actually picked). Harmless if the farm AP is not present.
sed -e "s/@BSSID@/$PREFBSSID/g" -e "s/@FREQ@/$FREQ/g" \
    /etc/pigpulse/wpa-uplink.tmpl > /etc/wpa_supplicant/wpa-pigpulse-uplink.conf
chmod 600 /etc/wpa_supplicant/wpa-pigpulse-uplink.conf
unset PSK64

# Venue identity. Never overwritten on reinstall, so a venue edit sticks.
# wan-sta.freq is the saved channel: the boot path does NOT scan (the firmware
# rejects scans for the first ~20 s after power-on), it connects straight to the
# saved BSSID on the saved frequency. Seeded from the AP's own base channel.
[ -s /etc/pigpulse/wan-sta.ssid ]  || printf '%s\n' "$SSID" > /etc/pigpulse/wan-sta.ssid
[ -s /etc/pigpulse/wan-sta.bssid ] || printf '%s\n' "$PREFBSSID" > /etc/pigpulse/wan-sta.bssid
[ -s /etc/pigpulse/wan-sta.freq ]  || printf '%s\n' "$FREQ" > /etc/pigpulse/wan-sta.freq
chmod 644 /etc/pigpulse/wan-sta.ssid /etc/pigpulse/wan-sta.bssid /etc/pigpulse/wan-sta.freq
log "uplink template written (600, SSID '$SSID', BSSID $PREFBSSID, saved freq $FREQ MHz)"

# ---------------------------------------------------------------- units
install -m 644 "$SRC"/pigpulse-wan-ap-conf.service /etc/systemd/system/pigpulse-wan-ap-conf.service
install -m 644 "$SRC"/pigpulse-wan-sta.service /etc/systemd/system/pigpulse-wan-sta.service
mkdir -p /etc/systemd/system/hostapd.service.d
install -m 644 "$SRC"/20-wan-sta-order.conf /etc/systemd/system/hostapd.service.d/20-wan-sta-order.conf
install -m 644 "$SRC"/10-unmanage-wlan0.conf /etc/NetworkManager/conf.d/10-unmanage-wlan0.conf
# 755 on purpose: dnsmasq runs as user `dnsmasq` and must traverse this dir to
# read wan-resolv.conf. A 700 dir here silently kills DNS for every AP client.
install -d -m 755 /etc/pigpulse
if [ -r "$SRC"/wan-sta.md ]; then
  install -m 644 "$SRC"/wan-sta.md /etc/pigpulse/wan-sta.md
else
  install -m 644 "$SRC"/README.md /etc/pigpulse/wan-sta.md
fi

# dnsmasq reads ONLY wan-resolv.conf (resolv-file replaces /etc/resolv.conf),
# so seed it from the live resolver before pointing dnsmasq at it.
if [ ! -s /etc/pigpulse/wan-resolv.conf ]; then
  {
    echo "# seeded from /etc/resolv.conf at install time"
    awk '$1 == "nameserver" {print}' /etc/resolv.conf 2>/dev/null
  } > /etc/pigpulse/wan-resolv.conf
fi
chmod 644 /etc/pigpulse/wan-resolv.conf
if ! grep -q '^resolv-file=/etc/pigpulse/wan-resolv.conf' /etc/dnsmasq.conf; then
  cp -a /etc/dnsmasq.conf "$BK"/dnsmasq.conf 2>/dev/null
  printf '\n# PigPulse: extra upstream that outlives the laptop tether\nresolv-file=/etc/pigpulse/wan-resolv.conf\n' >> /etc/dnsmasq.conf
fi
rm -f /etc/dnsmasq.d/90-pigpulse-wan-resolv.conf
systemctl restart dnsmasq 2>/dev/null || true
log "dnsmasq extra upstream wired (restarted)"

systemctl daemon-reload
systemctl enable pigpulse-wan-ap-conf.service pigpulse-wan-sta.service >/dev/null 2>&1
nmcli general reload conf >/dev/null 2>&1 || true
sleep 2
log "units installed + enabled (gated by /etc/pigpulse/wan-sta.enabled)"

# --------------------------------------------------------------- validate
echo
echo "════ VALIDATION ════"
echo "  unit file syntax:"
systemd-analyze verify /etc/systemd/system/pigpulse-wan-ap-conf.service /etc/systemd/system/pigpulse-wan-sta.service 2>&1 | sed 's/^/    /' || true
# ---------------------------------------------------------------- Pi resolver
# The Pi must resolve through its OWN dnsmasq. NetworkManager used to write the
# current default route's DNS into /etc/resolv.conf, so unplugging the laptop
# tether left `nameserver 10.42.0.1` behind and the Pi lost DNS even with the
# Wi-Fi uplink up (measured 2026-11-12).
NM_DNS=/etc/NetworkManager/conf.d/90-dns-none.conf
if [ -d /etc/NetworkManager/conf.d ]; then
  cat > "$NM_DNS" <<'DNSEOF'
[main]
# PigPulse: dnsmasq (127.0.0.1) is the Pi's resolver, not NetworkManager.
# NM writes the CURRENT DEFAULT ROUTE's DNS, so an unplugged tether left a dead
# nameserver behind. dnsmasq reads /etc/pigpulse/wan-resolv.conf, which the
# uplink runner merges on every attempt (venue DNS, then tether, then public).
dns=none
DNSEOF
  chmod 644 "$NM_DNS"
fi
case "$(head -1 /etc/resolv.conf 2>/dev/null)" in
  *PigPulse*|"nameserver 127.0.0.1") : ;;
  *)
    cp -a /etc/resolv.conf "/root/pigpulse-backups/DNS-resolv.conf.$(date +%Y%m%d-%H%M%S)" 2>/dev/null
    cat > /etc/resolv.conf <<'DNSEOF'
# PigPulse: the Pi resolves through its own dnsmasq, which is always up because
# it also serves DHCP/DNS to the AP. Upstreams: /etc/pigpulse/wan-resolv.conf.
# NetworkManager is told `dns=none` so it cannot overwrite this file again.
nameserver 127.0.0.1
DNSEOF
    chmod 644 /etc/resolv.conf
    ;;
esac
if [ "$(systemctl is-active NetworkManager 2>/dev/null)" = active ]; then
  systemctl reload NetworkManager >/dev/null 2>&1 || true
fi

echo "  enabled:   ap-conf=$(systemctl is-enabled pigpulse-wan-ap-conf.service 2>&1) uplink=$(systemctl is-enabled pigpulse-wan-sta.service 2>&1)"
echo "  saved venue: ssid=$(cat /etc/pigpulse/wan-sta.ssid 2>/dev/null) bssid=$(cat /etc/pigpulse/wan-sta.bssid 2>/dev/null) freq=$(cat /etc/pigpulse/wan-sta.freq 2>/dev/null)"
echo "  flag:      $( [ -e /etc/pigpulse/wan-sta.enabled ] && echo present || echo absent )"
echo "  5 GHz:     $( [ -e /etc/pigpulse/wan-sta-allow-5g ] && echo allowed || echo 'refused (default)' )"
echo "  picker self-test:"
if command -v awk >/dev/null; then
  printf '%s\n' \
    "BSS 2c:b6:c2:1e:9b:d5(on x)" "	freq: 5580.0" "	signal: -40.00 dBm" "	SSID: test-ssid" \
    "BSS 2c:b6:c2:1e:9b:d4(on x)" "	freq: 2412.0" "	signal: -70.00 dBm" "	SSID: test-ssid" \
    | /usr/local/sbin/pigpulse-wan-pick "test-ssid" "" | sed 's/^/    /'
else
  echo "    (skipped, no awk)"
fi
echo "  hostapd ordering drop-in:"
systemctl show hostapd.service -p Wants -p After | sed 's/^/    /'
echo "  boot order (uplink must come BEFORE hostapd):"
systemctl show pigpulse-wan-sta.service -p After -p Wants | sed 's/^/    /'
echo "  NM unmanaged:"
nmcli -t -f DEVICE,STATE device status 2>/dev/null | grep -E 'wlan0|wlan1' | sed 's/^/    /'
echo
echo "  base AP config:   /etc/hostapd/hostapd.conf.base (channel $CH)"
echo "  generated config: /etc/hostapd/hostapd.conf"
echo
echo "  Pi resolver:"
sed -n '1,6p' /etc/resolv.conf 2>/dev/null | sed 's/^/    /'
echo
echo "  default routes now:"
ip route | grep '^default' | sed 's/^/    /'
echo
log "done — mode is OFF until /etc/pigpulse/wan-sta.enabled exists"
