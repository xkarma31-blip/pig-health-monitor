#!/usr/bin/env python3
"""
PigPulse thermal fault doctor — one command, definitive verdict.

Run this AFTER swapping in the fixed card:

    python3 ~/thermal-pi/scripts/thermal_doctor.py

Why this exists: `init failed: [Errno 121] Remote I/O error` from the Melexis
driver says nothing. This script reproduces the failure, isolates WHICH layer
is broken by probing the bus directly, and applies the fix that is safe to
apply automatically. It never guesses: every branch below is driven by a
measurement.

Layers checked, in order:
  1. is the I2C bus device present?          -> device tree / dtparam
  2. can this user open it?                  -> unix group `i2c`
  3. does the MLX90640 ACK anywhere?         -> the real question
  4. which bus is it on?                     -> auto-fixes I2C_BUS
  5. does the driver initialise at 4 Hz?     -> baud / settle-delay / protocol

Exit codes: 0 = feed should be working, 1 = hardware fault found,
2 = config fault found (and fixed, if --fix), 3 = inconclusive.
"""
from __future__ import annotations

import argparse
import errno
import fcntl
import os
import subprocess
import sys

I2C_SLAVE = 0x0703          # linux/i2c-dev.h
MLX90640 = 0x33
SCAN_LO, SCAN_HI = 0x08, 0x77
BUSES = ("/dev/i2c-1", "/dev/i2c-0")

OK, FAIL, FIXED, UNKNOWN = "OK", "FAIL", "FIXED", "?"


def hr(title: str) -> None:
    print(f"\n\033[1m== {title} ==\033[0m")


def say(tag: str, msg: str) -> None:
    colour = {OK: "\033[32m", FIXED: "\033[36m", FAIL: "\033[31m"}.get(tag, "\033[33m")
    print(f"  [{colour}{tag:5}\033[0m] {msg}")


def groups() -> set[str]:
    try:
        return set(subprocess.check_output(["id", "-nG"], text=True).split())
    except Exception:
        return set()


def bus_present(bus: str) -> bool:
    return os.path.exists(bus)


def can_open(bus: str) -> tuple[bool, str]:
    try:
        fd = os.open(bus, os.O_RDWR)
        os.close(fd)
        return True, "opened read-write"
    except PermissionError:
        return False, "permission denied"
    except OSError as e:
        code = errno.errorcode.get(e.errno, str(e.errno)) if e.errno is not None else "unknown"
        return False, f"{code}: {e.strerror}"


def ack(bus: str, addr: int) -> bool:
    try:
        fd = os.open(bus, os.O_RDWR)
    except OSError:
        return False
    try:
        fcntl.ioctl(fd, I2C_SLAVE, addr)
        os.write(fd, b"")
        return True
    except OSError:
        return False
    finally:
        os.close(fd)


def scan(bus: str) -> list[int]:
    out = []
    try:
        fd = os.open(bus, os.O_RDWR)
    except OSError:
        return out
    try:
        for a in range(SCAN_LO, SCAN_HI + 1):
            try:
                fcntl.ioctl(fd, I2C_SLAVE, a)
                os.write(fd, b"")
                out.append(a)
            except OSError:
                pass
    finally:
        os.close(fd)
    return out


def config_bus() -> str | None:
    p = os.path.expanduser("~/thermal-pi/config.py")
    try:
        for line in open(p):
            if line.startswith("I2C_BUS"):
                return line.split("=", 1)[1].strip().strip("\"'")
    except OSError:
        return None
    return None


def set_config_bus(value: str) -> bool:
    p = os.path.expanduser("~/thermal-pi/config.py")
    try:
        src = open(p).read()
        out, hit = [], False
        for line in src.splitlines(keepends=True):
            if line.startswith("I2C_BUS"):
                out.append(f'I2C_BUS = "{value}"\n')
                hit = True
            else:
                out.append(line)
        if not hit:
            return False
        open(p, "w").write("".join(out))
        return True
    except OSError:
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true",
                    help="apply safe automatic fixes (I2C_BUS, guidance only)")
    args = ap.parse_args()

    print("\033[1mPigPulse thermal fault doctor\033[0m")
    print(f"  user={os.environ.get('USER') or os.getuid()}  "
          f"machine={os.uname().machine}")

    # ---- 1. bus presence -------------------------------------------------
    hr("1. I2C bus devices")
    present = {}
    for b in BUSES:
        if bus_present(b):
            present[b] = True
            say(OK, f"{b} exists")
        else:
            present[b] = False
            say(FAIL, f"{b} MISSING -> enable I2C: "
                      f"add 'dtparam=i2c_arm=on' to /boot/firmware/config.txt, reboot")
    if not any(present.values()):
        say(FAIL, "no I2C bus at all - nothing else can be tested")
        return 1

    # ---- 2. permissions --------------------------------------------------
    hr("2. Permissions")
    g = groups()
    if "i2c" in g:
        say(OK, "user is in group 'i2c'")
    else:
        say(FAIL, "user NOT in group 'i2c' -> "
                  "sudo usermod -aG i2c $USER  then reboot or re-login")
    for b, ok in present.items():
        if not ok:
            continue
        good, why = can_open(b)
        say(OK if good else FAIL, f"{b}: {why}")

    # ---- 3. does the sensor answer? --------------------------------------
    hr("3. MLX90640 address scan (0x08-0x77)")
    found: dict[str, list[int]] = {}
    for b in BUSES:
        if not present[b]:
            continue
        addrs = scan(b)
        found[b] = addrs
        pretty = " ".join(f"0x{a:02X}" for a in addrs) or "-"
        verdict = "0x33 PRESENT" if MLX90640 in addrs else "no 0x33"
        say(OK if MLX90640 in addrs else FAIL, f"{b}: {pretty}   ({verdict})")

    live = [b for b in BUSES if MLX90640 in found.get(b, [])]
    if not live:
        hr("VERDICT: hardware fault - the sensor is not on the bus")
        print("""
  The MLX90640 did not acknowledge on ANY bus. No software change fixes
  this. Work the list in order and stop at the first thing that is wrong:

    1. POWER   measure 3V3 with a multimeter AT THE SENSOR's VDD pin.
              Do not assume - a dead sensor or a reversed jumper both
              present as "not responding".
    2. GROUND  the sensor GND must be common with the Pi GND.
    3. PINS    SDA -> header pin 3 (GPIO2)
              SCL -> header pin 5 (GPIO3)
              These are the two most commonly SWAPPED pairs.
    4. PULLUPS 4.7k from SDA to 3V3 AND 4.7k from SCL to 3V3.
              This is the single most common cause of a permanent EIO:
              many MLX90640 modules ship without them, and without
              pull-ups the bus floats and every transfer fails.
    5. LENGTH  replace long dupont leads with short ones; I2C capacitance
              rises with length and 100kHz is not forgiving.
""")
        return 1

    # ---- 4. right bus? ---------------------------------------------------
    hr("4. Bus selection")
    cfg = config_bus()
    if len(live) > 1:
        say(UNKNOWN, f"0x33 answers on more than one bus: {live} - "
                     f"ambiguous, check for a second sensor")
    elif cfg and live[0] != cfg:
        say(FAIL, f"config.py uses {cfg} but the sensor is on {live[0]}")
        if args.fix and set_config_bus(live[0]):
            say(FIXED, f"config.py I2C_BUS rewritten to {live[0]}")
            print("         then: sudo systemctl restart pigpulse-thermal")
        else:
            print(f"         fix by hand: set I2C_BUS = \"{live[0]}\" in "
                  f"~/thermal-pi/config.py, then restart pigpulse-thermal")
        return 2
    else:
        say(OK, f"config.py ({cfg}) matches the bus the sensor is on")

    # ---- 5. driver init --------------------------------------------------
    hr("5. Melexis driver initialise")
    try:
        sys.path.insert(0, os.path.expanduser("~/thermal-pi"))
        import mlx_reader  # type: ignore  # Pi-only module; sys.path above is where it lives
        print(f"  attempting mlx_reader.init() on {live[0]} @ 0x33 ...")
        r = mlx_reader.MlxReader(bus=live[0], addr=MLX90640)
        if r.init():
            say(OK, "driver initialised - the thermal feed should be live")
            print("\n  next: curl -sk https://127.0.0.1:8080/health")
            return 0
        say(FAIL, "driver init failed:")
        for line in (r.last_error or "").splitlines():
            print(f"         {line}")
        print("""
  The sensor acknowledges but the driver's register read fails, so the bus
  and the wiring are fine and this is a PROTOCOL or TIMING problem:

    a) lower the bus speed - put this in /boot/firmware/config.txt:
         dtparam=i2c_arm_baudrate=40000
       then reboot. 100kHz over long leads is marginal.
    b) check /health's "I2C all buses" line to confirm stability.
    c) if it is stable but still failing, the sensor may need a longer
       power-on settle before its first EEPROM read; _loop retries every
       10s, so watch whether it eventually succeeds.
""")
        return 1
    except Exception as e:  # noqa: BLE001
        say(UNKNOWN, f"could not exercise the driver: {type(e).__name__}: {e}")
        return 3


if __name__ == "__main__":
    sys.exit(main())
