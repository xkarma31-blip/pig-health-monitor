#!/usr/bin/env python3
"""
I2C bus scanner — port of ESP32 i2c_scanDiag / i2c_scanAddrs.

Uses only the stdlib (fcntl + I2C_SLAVE) so it runs before any MLX driver
is installed. On Raspberry Pi: python3 i2c_scanDiag.py [/dev/i2c-1]
"""

from __future__ import annotations

import argparse
import fcntl
import os
import sys

I2C_SLAVE = 0x0703  # linux/i2c-dev.h

# From config.h / sensors.cpp
MLX90640_ADDR = 0x33
SCAN_LO = 0x08
SCAN_HI = 0x77  # inclusive


def scan_bus(bus_path: str) -> list[int]:
    found: list[int] = []
    if not os.path.exists(bus_path):
        raise FileNotFoundError(
            f"{bus_path} not found — enable I2C "
            f"(raspi-config → Interface Options → I2C) and check dtparam=i2c_arm=on"
        )
    fd = os.open(bus_path, os.O_RDWR)
    try:
        for addr in range(SCAN_LO, SCAN_HI + 1):
            try:
                fcntl.ioctl(fd, I2C_SLAVE, addr)
                # Zero-length write probes ACK without transferring payload
                os.write(fd, b"")
                found.append(addr)
            except OSError:
                continue
    finally:
        os.close(fd)
    return found


def verdict(found: list[int]) -> str:
    if MLX90640_ADDR in found:
        return (
            f"MLX90640 PRESENT at 0x{MLX90640_ADDR:02X} - wiring OK\n"
            f"I2C pins for Pi 4B: SDA=pin3 (GPIO2), SCL=pin5 (GPIO3)"
        )
    return (
        "MLX90640 MISSING - check:\n"
        "  3V3 power, GND,\n"
        "  SDA->pin3 / SCL->pin5 (not swapped),\n"
        "  4.7k pull-ups SDA->3V3 and SCL->3V3\n"
        f"  Expected ACK at 0x{MLX90640_ADDR:02X}"
    )


def main() -> int:
    p = argparse.ArgumentParser(description="PigPulse Pi I2C scan")
    p.add_argument("bus", nargs="?", default="/dev/i2c-1")
    args = p.parse_args()

    print(f"[I2C] Scanning {args.bus} ...")
    try:
        found = scan_bus(args.bus)
    except FileNotFoundError as e:
        print(f"[I2C] ERROR: {e}", file=sys.stderr)
        return 2
    except PermissionError:
        print(
            f"[I2C] Permission denied on {args.bus} — "
            f"usermod -aG i2c $USER  (then re-login), or run with sudo",
            file=sys.stderr,
        )
        return 3

    for addr in found:
        print(f"[I2C] ACK at 0x{addr:02X}")
    print(f"[I2C] {len(found)} device(s) found")
    print(verdict(found))
    return 0 if MLX90640_ADDR in found else 1


if __name__ == "__main__":
    sys.exit(main())
