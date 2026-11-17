#!/bin/bash
# Offline unit tests for pigpulse-wan-pick. No radio involved.
set -u
PICK="$1"
PASS=0 FAIL=0

checkpref() { # name expected preferred input...
  local name="$1" want="$2" pref="$3" got
  got=$(printf '%s\n' "${@:4}" | "$PICK" "GFiber_E9BD4" "$pref")
  if [ "$got" = "$want" ]; then
    PASS=$((PASS+1)); printf 'ok   %-34s -> %s\n' "$name" "$got"
  else
    FAIL=$((FAIL+1)); printf 'FAIL %-34s want=%s got=%s\n' "$name" "$want" "$got"
  fi
}

check() { # name expected input...
  local name="$1" want="$2" got
  got=$(printf '%s\n' "${@:3}" | "$PICK" "GFiber_E9BD4" "2c:b6:c2:1e:9b:d4")
  if [ "$got" = "$want" ]; then
    PASS=$((PASS+1)); printf 'ok   %-34s -> %s\n' "$name" "$got"
  else
    FAIL=$((FAIL+1)); printf 'FAIL %-34s want=%s got=%s\n' "$name" "$want" "$got"
  fi
}

check "2.4 only" "24 2c:b6:c2:1e:9b:d4 2437 -54.00" \
  "BSS 2c:b6:c2:1e:9b:d4(on wlan0sta)" "	freq: 2437.0" "	signal: -54.00 dBm" "	SSID: GFiber_E9BD4"

check "both bands -> 5 GHz wins" "5G 2c:b6:c2:1e:9b:d5 5580 -40.00" \
  "BSS 2c:b6:c2:1e:9b:d5(on wlan0sta)" "	freq: 5580.0" "	signal: -40.00 dBm" "	SSID: GFiber_E9BD4" \
  "BSS 2c:b6:c2:1e:9b:d4(on wlan0sta)" "	freq: 2412.0" "	signal: -70.00 dBm" "	SSID: GFiber_E9BD4"

check "5 GHz only" "5G 2c:b6:c2:1e:9b:d5 5580 -40.00" \
  "BSS 2c:b6:c2:1e:9b:d5(on wlan0sta)" "	freq: 5580.0" "	signal: -40.00 dBm" "	SSID: GFiber_E9BD4"

check "ssid absent" "NONE" \
  "BSS 11:22:33:44:55:66(on wlan0sta)" "	freq: 2437.0" "	signal: -50.00 dBm" "	SSID: GFiber_E9BD4-Guest"

checkpref "preferred bssid wins tie" "24 aa:bb:cc:dd:ee:ff 2437 -66.00" "aa:bb:cc:dd:ee:ff" \
  "BSS 11:22:33:44:55:66(on wlan0sta)" "	freq: 2437.0" "	signal: -50.00 dBm" "	SSID: GFiber_E9BD4" \
  "BSS aa:bb:cc:dd:ee:ff(on wlan0sta)" "	freq: 2437.0" "	signal: -66.00 dBm" "	SSID: GFiber_E9BD4"

check "hidden ssid ignored" "NONE" \
  "BSS 11:22:33:44:55:66(on wlan0sta)" "	freq: 2437.0" "	signal: -50.00 dBm" "	SSID: "

check "bss load line is not a bss" "24 2c:b6:c2:1e:9b:d4 2437 -54.00" \
  "BSS 2c:b6:c2:1e:9b:d4(on wlan0sta)" "	freq: 2437.0" "	signal: -54.00 dBm" "	BSS Load:" "		station count: 3" "	SSID: GFiber_E9BD4"

check "space ssid is a different ssid" "NONE" \
  "BSS 2c:b6:c2:1e:9b:d4(on wlan0sta)" "	freq: 2462.0" "	signal: -61.00 dBm" "	SSID: GFiber E9BD4"

check "ch14 edge" "24 2c:b6:c2:1e:9b:d4 2484 -61.00" \
  "BSS 2c:b6:c2:1e:9b:d4(on wlan0sta)" "	freq: 2484.0" "	signal: -61.00 dBm" "	SSID: GFiber_E9BD4"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
