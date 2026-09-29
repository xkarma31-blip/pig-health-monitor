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

import time
from typing import Optional

import config
import pigpulse_stats

# MLX90640 frame geometry: 32x24. Mirrors pigpulse_stats.W/H/N.
N = 768

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

    def init(self) -> bool:
        """Port of mlx90640_init()."""
        try:
            m = _ensure_driver()
        except RuntimeError as e:
            self.last_error = str(e)
            self.ready = False
            return False

        try:
            # Accept both absolute path and Melexis 'I2C-1' token
            hw = self.hw
            if hw.startswith("/dev/i2c-"):
                hw = "I2C-" + hw.rsplit("-", 1)[-1]
            dev = m.Mlx9064x(hw, i2c_addr=self.addr, frame_rate=self.refresh_hz)
            dev.emissivity = config.EMISSIVITY
            dev.init()
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
            self.last_error = f"init failed: {e}"
            print(f"[MLX90640] {self.last_error}")
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
            return True
        except Exception as e:
            self.last_error = f"read failed: {e}"
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
