#!/usr/bin/env python3
"""
MLX90640 reader for Raspberry Pi — Melexis official Python driver
(mlx9064x-driver, package import name: mlx.mlx90640).

API contract preserved from sensors.cpp mlx90640_init / mlx90640_readFrame:
  - init at 0x33, 4 Hz, chess-oriented compensation path in driver
  - two-subpage equivalent = one read_frame() + do_compensation()
  - returns 768 float pixel temps + ambient Ta
  - fail-safe: never raises out of read_frame_stats(); sets last_error

Install (on the Pi):
    pip install mlx9064x-driver
Enable I2C first (see README).
"""

from __future__ import annotations

import errno
import os
import time
from typing import Optional

import config
import pigpulse_stats

# MLX90640 frame geometry: 32x24. Mirrors pigpulse_stats W/H/N.
N = 768

I2C_SLAVE = 0x0703  # linux/i2c-dev.h


class CalibrationError(RuntimeError):
    """The sensor returned calibration data that cannot be physically valid."""


# 2026-11-09: an I2C read on which the slave does not drive the bus returns
# 0xFFFF (the pull-ups win). Treat that value as "no vote", not as data.
_EEPROM_FAIL_WORD = 0xFFFF
_EEPROM_READ_ATTEMPTS = 5


def _install_consensus_eeprom_read(module) -> None:
    """Replace the driver's OR-poisoning EEPROM read with a per-word vote.

    mlx9064x-driver 1.3.0 ORs three EEPROM reads together. That clears stray
    zero bits (the original Melexis trick) but also permanently sets every bit
    that any single bad read returned. Since a failed read returns 0xFFFF, one
    bad read destroys the whole calibration and the sensor goes on answering.

    Idempotent, and additive: the driver object, its API and its maths are all
    untouched; only the byte-retrieval step changes.
    """
    import struct as _struct
    from collections import Counter

    cls = getattr(module, "Mlx90640EEPROM", None)
    if cls is None or getattr(cls, "_pigpulse_consensus", False):
        return

    def read_eeprom_from_device(self):
        words = self.eeprom_size // 2
        reads = []
        last_err = "no attempt was made"
        for _ in range(_EEPROM_READ_ATTEMPTS):
            try:
                buf, status = self.device.hw.i2c_read(
                    self.device.i2c_addr, 0x2400, self.eeprom_size
                )
            except Exception as e:                      # noqa: BLE001 - transport
                last_err = str(e)
                continue
            if status != 0:
                last_err = f"driver status {status}"
                continue
            reads.append(list(_struct.unpack(">" + str(words) + "H", buf)))

        if not reads:
            raise ValueError(
                f"EEPROM unreadable after {_EEPROM_READ_ATTEMPTS} attempts "
                f"({last_err})"
            )

        merged = []
        for i in range(words):
            votes = [r[i] for r in reads if r[i] != _EEPROM_FAIL_WORD]
            if votes:
                merged.append(Counter(votes).most_common(1)[0][0])
            else:
                merged.append(_EEPROM_FAIL_WORD)

        self.eeprom = merged
        self.extract_broken_pixels()
        self.extract_outlier_pixels()
        self.get_bad_pixels()

    cls.read_eeprom_from_device = read_eeprom_from_device
    cls._pigpulse_consensus = True


def validate_calibration(dev) -> list:
    """Reasons the loaded calibration cannot be trusted. Empty list = usable.

    A real MLX90640 stores 768 DIFFERENT alpha values, one per pixel; that is
    the entire point of factory calibration. An alpha table with one value is
    not a marginal sensor reading, it is a failed load, and every temperature
    derived from it is fiction.
    """
    cp = getattr(dev, "calc_params", None)
    if cp is None:
        return ["driver exposed no calc_params - calibration never loaded"]

    problems = []

    ids = [getattr(cp, "Id0", None),
           getattr(cp, "Id1", None),
           getattr(cp, "Id2", None)]
    if all(v == 0xFFFF for v in ids):
        problems.append("device ID words are all 0xFFFF (EEPROM read failed)")

    alpha = list(getattr(cp, "alpha", []) or [])
    if len(alpha) != N:
        problems.append(f"alpha table has {len(alpha)} entries, expected {N}")
    elif len(set(alpha)) <= 4:
        problems.append(
            "alpha table collapsed to "
            f"{len(set(alpha))} distinct value(s) ({alpha[0]:.4g}) - the "
            "per-pixel factory calibration did not load"
        )

    vdd = getattr(cp, "Vdd_25", None)
    if isinstance(vdd, (int, float)) and not (-16000 <= vdd <= 0):
        problems.append(f"Vdd_25={vdd} is outside any physically possible range")

    return problems


def i2c_ack(bus: str, addr: int) -> tuple[bool, str]:
    """Raw address-only ACK probe. Returns (acked, why-not)."""
    import fcntl
    try:
        if not os.path.exists(bus):
            return False, f"{bus} does not exist (I2C not enabled in device tree)"
        fd = os.open(bus, os.O_RDWR)
    except PermissionError:
        return False, f"permission denied opening {bus} (run: usermod -aG i2c $USER, then re-login)"
    except OSError as e:
        return False, f"cannot open {bus}: {e.strerror}"
    try:
        fcntl.ioctl(fd, I2C_SLAVE, addr)
        os.write(fd, b"")
        return True, "ACK"
    except OSError as e:
        return False, f"no ACK at 0x{addr:02X} ({e.strerror or e})"
    finally:
        os.close(fd)


def _ecode(e: int | None) -> str:
    """Symbolic errno name, or the number when unknown."""
    if e is None:
        return "?"
    return errno.errorcode.get(e, str(e))


def explain_init_error(exc: BaseException, bus: str, addr: int) -> str:
    """Turn a bare OSError into something an operator can act on."""
    if isinstance(exc, CalibrationError):
        return str(exc)
    if isinstance(exc, ValueError) and "EEPROM" in str(exc):
        return (f"CALIBRATION UNREADABLE on {bus} at 0x{addr:02X}.\n"
                f"  {exc}\n"
                f"  -> the chip answers but its calibration cannot be read back.\n"
                f"  -> no temperature can be computed from this, so none is shown.\n"
                f"  -> this is the SAFE outcome; the driver used to return numbers\n"
                f"     anyway, which is how 154209 C reached the screen.")
    if not isinstance(exc, OSError):
        return f"{type(exc).__name__}: {exc}"

    e = exc.errno
    if e in (errno.EACCES, errno.EPERM):
        return (f"I2C PERMISSION DENIED on {bus} [{_ecode(e)}: {exc.strerror}]. "
                f"Fix: sudo usermod -aG i2c $USER  then log out and back in "
                f"(or reboot). Verify with: id -nG | tr ' ' '\\n' | grep -x i2c")
    if e == errno.ENOENT:
        return (f"I2C BUS {bus} MISSING [{_ecode(e)}: {exc.strerror}]. "
                f"Fix: enable I2C — add dtparam=i2c_arm=on to /boot/firmware/config.txt, reboot. "
                f"Check with: ls {bus}")

    acked, why = i2c_ack(bus, addr)
    head = (f"I2C FAULT on {bus} at 0x{addr:02X} "
            f"[{_ecode(e)}: {exc.strerror or exc}]")
    if acked:
        return (f"{head}\n"
                f"  -> device DOES acknowledge 0x{addr:02X}, so power/GND/pull-ups are OK.\n"
                f"  -> the failure is in the MLX90640 register read itself, not the wiring.\n"
                f"  Likely: sensor needs a power-on settle delay before the first EEPROM read "
                f"(retrying every 10s should clear it); or a marginal bus at 100kHz over long "
                f"leads — try i2c_arm_baudrate=40000 in /boot/firmware/config.txt.")
    return (f"{head}\n"
            f"  -> DEVICE DOES NOT RESPOND ({why})\n"
            f"  -> this is a WIRING or POWER fault, not software. Check in this order:\n"
            f"     1. 3V3 actually present at the sensor VDD (measure it, do not assume)\n"
            f"     2. GND common between sensor and Pi\n"
            f"     3. SDA -> header pin 3 (GPIO2), SCL -> header pin 5 (GPIO3), NOT swapped\n"
            f"     4. 4.7k pull-up from SDA to 3V3 AND SCL to 3V3 (many modules omit these)\n"
            f"  If the sensor is on the OTHER header pair, it is on /dev/i2c-0 "
            f"(pins 27/28) — check the 'I2C all buses' line in /health.")


# Optional heavy import deferred so i2c_scanDiag / stats unit paths work
# without the driver installed (e.g. on a dev laptop).
_mlx = None
_import_err: str | None = None


def _ensure_driver():
    global _mlx, _import_err
    if _mlx is not None:
        return _mlx
    if _import_err:
        raise RuntimeError(_import_err)
    try:
        import mlx.mlx90640 as mlx90640  # type: ignore
        _mlx = mlx90640
        return _mlx
    except Exception as e:  # ImportError or nested load failure
        _import_err = (
            f"mlx9064x-driver not available: {e}. "
            f"Install: pip install mlx9064x-driver"
        )
        raise RuntimeError(_import_err) from e


def _close_dev(dev) -> None:
    """Close the SMBus FD held by a Mlx9064x device.

    The vendored driver opens smbus2.SMBus(channel) in HwRpiI2cHw.__init__ and
    the mlx package has no close()/__del__, so the caller must close it or every
    re-init leaks a file descriptor until the process hits EMFILE.
    """
    if dev is None:
        return
    bus = getattr(getattr(dev, "hw", None), "i2c", None)
    if bus is None:
        return
    try:
        bus.close()
    except Exception:
        pass


class MlxReader:
    """Stateful reader mirroring static state in sensors.cpp."""

    def __init__(self, bus: str | None = None, addr: int | None = None,
                 refresh_hz: float | None = None):
        # config.I2C_BUS is the single source of truth (e.g. "/dev/i2c-1").
        # The Melexis driver wants the bare token form ('I2C-1'); init() converts.
        self.bus = config.I2C_BUS if bus is None else bus
        self.hw = self.bus
        self.addr = config.MLX90640_ADDR if addr is None else addr
        self.refresh_hz = config.REFRESH_HZ if refresh_hz is None else refresh_hz
        self.dev = None
        self.ready = False
        self.frame_count = 0
        self.last_frame_mono = 0.0
        self.last_error = "not initialized"
        self.last_image: list[float] | None = None
        self.last_ambient = 0.0
        # 2026-11-08: recovery bookkeeping. After repeated I2C faults the
        # Melexis device object can become unusable; rebuild it in place.
        self._fail_streak = 0
        self._last_rebuild = 0.0

    def init(self) -> bool:
        """Port of mlx90640_init()."""
        # 2026-11-14: close any previous device FIRST. The vendored
        # HwRpiI2cHw opens smbus2.SMBus(channel) in __init__ and the mlx
        # package exposes no close()/__del__, so every re-init (the 10 s retry
        # loop, and the recovery rebuild below) leaked one FD. After ~2h51m
        # the process sat at 1023/1024 FDs and the whole web server hung with
        # EMFILE. Closing here is the whole fix.
        _close_dev(self.dev)
        self.dev = None
        try:
            m = _ensure_driver()
        except RuntimeError as e:
            self.last_error = str(e)
            self.ready = False
            return False

        dev = None
        try:
            # Accept both absolute path and Melexis 'I2C-1' token
            hw = self.hw
            if hw.startswith("/dev/i2c-"):
                hw = "I2C-" + hw.rsplit("-", 1)[-1]
            _install_consensus_eeprom_read(m)
            dev = m.Mlx9064x(hw, i2c_addr=self.addr, frame_rate=self.refresh_hz)
            dev.emissivity = config.EMISSIVITY
            dev.init()

            problems = validate_calibration(dev)
            if problems:
                raise CalibrationError(
                    "CALIBRATION REJECTED - refusing to report temperatures.\n"
                    + "".join(f"  - {p}\n" for p in problems)
                    + "  The sensor answers on I2C, so power and ground are fine;\n"
                      "  it is the calibration block that is not trustworthy.\n"
                      "  Temperature output is suppressed instead of invented."
                )
            # 2026-11-08: the vendored Melexis driver defines m_lDaqFrameIdx
            # ONLY in its USB-EVB backend. On I2C, do_compensation() reads it
            # as soon as the EEPROM TGC coefficients are non-zero, raising
            # AttributeError on every frame with no way to recover. Seed it.
            if not hasattr(dev, "m_lDaqFrameIdx"):
                dev.m_lDaqFrameIdx = 0
            self.dev = dev
            self.ready = True
            self.last_error = "OK"
            print(
                f"[MLX90640] Initialized (addr=0x{self.addr:02X}, "
                f"{self.refresh_hz} Hz, emissivity={config.EMISSIVITY})"
            )
            return True
        except Exception as e:
            self.ready = False
            _close_dev(dev)          # never leak a partially-built device
            self.dev = None
            self.last_error = explain_init_error(e, self.bus, self.addr)
            print(f"[MLX90640] {self.last_error}", flush=True)
            return False

    def _wait_for_frame(self, max_wait_s: float = 2.5) -> bool:
        """Bounded wait for the sensor's data-ready bit.

        The vendor HAL waits on this bit in an unbounded while-loop, so a chip
        that stops converting hangs the reader thread with no error at all.
        Bounding it turns a silent hang into a named fault.
        """
        import struct as _struct

        deadline = time.monotonic() + max_wait_s
        last = None
        saw_reply = False
        while time.monotonic() < deadline:
            try:
                buf, status = self.dev.i2c_read(0x8000, 2)
            except Exception as e:  # noqa: BLE001 - transport
                self.last_error = f"status poll failed: {e}"
                time.sleep(0.05)
                continue
            if status == 0:
                saw_reply = True
                last = _struct.unpack(">H", buf)[0]
                if last & 0x0008:
                    return True
            time.sleep(0.05)

        if not saw_reply:
            self.last_error = (
                "sensor is not answering status polls at 0x8000 "
                f"(waited {max_wait_s:.1f}s)"
            )
        else:
            self.last_error = (
                "sensor is not producing frames: the data-ready bit (0x0008) "
                f"never rose in {max_wait_s:.1f}s, last status 0x{last:04X}. "
                "The chip answers I2C but its measurement engine has stopped; "
                "power-cycle the sensor's VDD."
            )
        return False

    def read_frame(self, image_out: Optional[list[float]] = None,
                   ambient_out: Optional[list[float]] = None) -> bool:
        """
        Port of mlx90640_readFrame() core path.
        image_out must be length 768 if provided (or None → internal buffer).
        """
        if not self.ready or self.dev is None:
            self.last_error = "not ready"
            return False

        t0 = time.monotonic()
        try:
            if not self._wait_for_frame():
                return False
            raw = self.dev.read_frame()
            if raw is None:
                self.last_error = "GetFrameData empty/None"
                return False
            # read_frame may return a list of buffered frames (EVB) or one frame
            if isinstance(raw, list) and raw and isinstance(raw[0], list):
                raw = raw[-1]

            temps = self.dev.do_compensation(
                list(raw), add_ambient_temperature=True
            )
            # do_compensation(..., add_ambient_temperature=True) must return
            # 768 pixels + 1 appended Ta. If a driver version ignores the flag
            # we would get exactly 768 and temps[-1] would silently become the
            # LAST PIXEL — ambient compensation would then drift on garbage,
            # with no error anywhere. Refuse instead of guessing.
            if len(temps) != N + 1:
                self.last_error = (
                    f"unexpected compensation length {len(temps)} (want {N + 1}: "
                    f"{N} pixels + 1 Ta) — driver ignored "
                    f"add_ambient_temperature"
                )
                return False
            ambient = float(temps[-1])
            pixels = [float(x) for x in temps[:N]]

            # Ta shift guard like sensors.cpp: Tr = Ta - TA_SHIFT is inside
            # driver physics; we only store ambient for EMA compensation.
            if image_out is not None:
                image_out[:] = pixels
            if ambient_out is not None:
                ambient_out.clear()
                ambient_out.append(ambient)

            self.last_image = pixels
            self.last_ambient = ambient
            self.frame_count += 1
            self.last_frame_mono = t0
            self.last_error = "OK"
            self._fail_streak = 0
            return True
        except Exception as e:
            self.last_error = f"read failed: {e}"
            # 2026-11-08: one bad bus moment used to leave this object dead
            # until a human restarted the unit (the 20:21-20:39 outage).
            # Rebuild the device in place, at most once every 30 s.
            self._fail_streak += 1
            now = time.monotonic()
            if self._fail_streak >= 5 and (now - self._last_rebuild) > 30:
                self._last_rebuild = now
                cause = self.last_error
                print(
                    f"[MLX90640] {self._fail_streak} failed frames in a row "
                    f"({e}) - rebuilding device",
                    flush=True,
                )
                self._fail_streak = 0
                self.init()
                # 2026-11-09: init() sets last_error = "OK" when the chip
                # re-ACKs, and we then return False regardless. Without this
                # restore the caller logs "frame read failed: OK", which is
                # exactly what the journal showed during the 11:06 outage.
                # A successful *re-initialisation* is not a successful *read*:
                # this frame still failed, so the cause must survive.
                self.last_error = cause
            return False

    def read_frame_stats(self) -> Optional[dict]:
        """Single-shot stats dict for /data without caller buffers."""
        img: list[float] = []
        amb: list[float] = []
        if not self.read_frame(img, amb):
            return None
        st = pigpulse_stats.frame_stats(img)
        st["ambient"] = amb[0] if amb else self.last_ambient
        return st

    def is_ready(self) -> bool:
        return self.ready

    def frames(self) -> int:
        return self.frame_count

    def frame_age_s(self) -> float:
        if self.last_frame_mono <= 0:
            return float("inf")
        return time.monotonic() - self.last_frame_mono


def averaged_reading(reader: MlxReader,
                      compensator: pigpulse_stats.AmbientCompensator | None = None
                      ) -> Optional[dict]:
    """FIELD mode: FRAME_AVERAGE_COUNT frames → one cached snapshot."""
    if not reader.ready:
        return None
    comp = compensator or pigpulse_stats.AmbientCompensator()
    avg = pigpulse_stats.FrameAverager()
    for i in range(config.FRAME_AVERAGE_COUNT):
        img: list[float] = []
        amb: list[float] = []
        if reader.read_frame(img, amb):
            avg.add(img, amb[0], comp)
        time.sleep(0.25)  # matches delay(250) in esp32d0wd-pigpulse.ino
    return avg.result()
