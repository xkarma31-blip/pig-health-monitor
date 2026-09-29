#!/bin/bash
# PigPulse v3 — offline MQTT broker bootstrap (Raspberry Pi)
#
# Installs Mosquitto from .debs staged on the card in /home/pigpulse/debs when
# the package is missing. Idempotent: safe to run on every boot.
#
# IMPORTANT — read before editing the config-writing block below.
# mosquitto 2.0 exits with status 3, BEFORE binding any port, when
# `persistence_location` or an identical `log_dest file` appears more than once
# across the whole config chain (mosquitto.conf + conf.d/*). That crash-looped
# this Pi from 2026-09-23 to 2026-09-28: the broker never listened, every ESP
# connect failed with rc=-2, and because the journal was volatile the error
# vanished at every reboot. An older version of THIS script wrote
# `persistence_location` + `log_dest file` into mosquitto.conf while
# conf.d/pigpulse.conf declared the same keys — i.e. this file caused the
# outage. conf.d/pigpulse.conf now deliberately omits both and only adds
# comment text explaining why. If you add them anywhere, add them in ONE place
# only, then verify with:
#     python3 ~/thermal-pi/scripts/pi_diag.py    # section 1b
# which statically detects duplicates across the whole chain.
set -u

DEB_DIR=/home/pigpulse/debs
CONF=/etc/mosquitto/mosquitto.conf
LOG=/var/log/pigpulse-mosquitto-bootstrap.log

mkdir -p /var/log
exec >>"$LOG" 2>&1
echo "=== $(date -Is) pigpulse mosquitto bootstrap ==="

if ! command -v mosquitto >/dev/null 2>&1; then
    shopt -s nullglob
    debs=("$DEB_DIR"/*.deb)
    if [ ${#debs[@]} -eq 0 ]; then
        echo "SKIP: no staged debs found in $DEB_DIR"
        exit 0
    fi
    echo "Installing ${#debs[@]} staged package(s)"
    export DEBIAN_FRONTEND=noninteractive
    dpkg -i "${debs[@]}"
    echo "dpkg exit=$?"
else
    echo "mosquitto already installed"
fi

# Guarantee the config chain: the main file must include conf.d/ (that is where
# `listener 1883 0.0.0.0` and `allow_anonymous` live). If we have to write it,
# we write ONLY the keys that must live here — persistence and log_dest are
# declared exactly once, in this file, and nowhere else.
if ! grep -qs 'include_dir */etc/mosquitto/conf.d' "$CONF"; then
    mkdir -p /etc/mosquitto /var/log/mosquitto
    cat > "$CONF" <<'EOF'
persistence true
persistence_location /var/lib/mosquitto/
log_dest file /var/log/mosquitto/mosquitto.log
include_dir /etc/mosquitto/conf.d
EOF
    echo "wrote $CONF (persistence + log_dest declared HERE only)"
fi

# Static duplicate guard: refuse to (re)start a broker that would exit 3.
dup_check() {
    python3 - "$CONF" <<'PY'
import os, sys
files = [sys.argv[1]] if os.path.isfile(sys.argv[1]) else []
d = "/etc/mosquitto/conf.d"
if os.path.isdir(d):
    files += [os.path.join(d, n) for n in sorted(os.listdir(d)) if n.endswith(".conf")]
seen, dups = {}, []
for p in files:
    try:
        lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
    except OSError:
        continue
    for i, raw in enumerate(lines, 1):
        s = raw.split("#", 1)[0].strip()
        if not s:
            continue
        k, _, v = s.partition(" ")
        if k == "persistence_location":
            ident = "persistence_location"
        elif k == "log_dest" and v.strip().lower().startswith("file"):
            ident = " ".join(s.split())
        else:
            continue
        if ident in seen:
            dups.append(f"{ident} at {p}:{i} duplicates {seen[ident]}")
        else:
            seen[ident] = f"{p}:{i}"
if dups:
    print("FATAL duplicate(s): " + "; ".join(dups))
    sys.exit(1)
print("config chain clean across %d file(s)" % len(files))
PY
}

if ! dup_check; then
    echo "REFUSING to start mosquitto: config would exit 3. Fix the duplicate above."
    exit 1
fi

if systemctl is-active --quiet mosquitto 2>/dev/null; then
    echo "mosquitto already active"
else
    systemctl enable mosquitto >/dev/null 2>&1 || true
    systemctl restart mosquitto >/dev/null 2>&1 || true
    sleep 1
fi

listening() {
    if command -v ss >/dev/null 2>&1; then
        ss -lnt | grep -q ':1883 '
    elif command -v netstat >/dev/null 2>&1; then
        netstat -lnt | grep -q ':1883 '
    else
        return 1
    fi
}

if listening; then
    echo "OK: mosquitto listening on 1883"
else
    echo "WARN: 1883 not listening yet"
    systemctl --no-pager -l status mosquitto 2>&1 | tail -15
    journalctl -u mosquitto -n 20 --no-pager 2>&1 | tail -20
fi
exit 0
