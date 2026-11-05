#!/usr/bin/env python3
"""Streaming PCM downmix for the barn mic: 48 kHz stereo → 16 kHz mono.

Why this exists
---------------
The ESP32-S3 pushes S16LE stereo at 48 kHz — 192 KB/s (1.54 Mbit/s). The
barn→cloud leg measures ~100 KB/s, so the app could never carry it in real
time: every clip arrived slower than it played, which is exactly the pause
between chunks. 16 kHz mono is 32 KB/s (0.256 Mbit/s) and fits with ~3x
headroom, and speech/barn noise carries nothing above 8 kHz worth keeping.

Naive decimation (keep every third sample) would alias everything above 8 kHz
back into the audible band. This applies a 127-tap Kaiser-windowed sinc
low-pass first: 0.00 dB to 6.5 kHz, -6 dB at 7.2 kHz, -63 dB from 8 kHz up,
measured in tests/test_pcm_downmix.py. State (filter tail, decimation phase and
any partial sample frame) is carried across calls, so the output is
byte-identical no matter how the network splits the stream.

The Pi runs Python 3.13, where `audioop` was removed — hence numpy rather than
`audioop.ratecv`.
"""

from __future__ import annotations

import numpy as np

# 127 taps at 48 kHz = 2.6 ms of linear-phase delay, and a transition band that
# reaches the -63 dB floor by the new Nyquist (8 kHz).
TAPS = 127
KAISER_BETA = 6.0
# Cutoff as a fraction of the OUTPUT Nyquist, leaving room for the transition.
CUTOFF_EDGE = 0.90


def design_lowpass(n: int = TAPS, factor: int = 3,
                   beta: float = KAISER_BETA) -> np.ndarray:
    """Kaiser-windowed sinc, cutoff at CUTOFF_EDGE * (out_rate / 2)."""
    fc = 0.5 / factor * CUTOFF_EDGE          # cycles/sample at the INPUT rate
    m = np.arange(n) - (n - 1) / 2.0
    h = np.sinc(2.0 * fc * m) * np.kaiser(n, beta)
    h /= np.sum(h)                            # unity DC gain
    return h.astype(np.float32)


class Downmixer:
    """One instance per stream: carries filter tail, phase and partial frame."""

    def __init__(self, in_rate: int, out_rate: int = 16000, n: int = TAPS) -> None:
        if in_rate % out_rate:
            raise ValueError("in_rate must be an integer multiple of out_rate")
        self.in_rate = int(in_rate)
        self.out_rate = int(out_rate)
        self.factor = self.in_rate // self.out_rate
        self._h = design_lowpass(n, self.factor)
        self._tail = np.zeros(len(self._h) - 1, dtype=np.float32)
        self._phase = np.zeros(0, dtype=np.float32)
        self._partial = b""
        self.samples_in = 0
        self.samples_out = 0

    def process(self, pcm: bytes, channels: int = 2) -> bytes:
        """Consume any number of bytes, emit S16LE mono at `out_rate`.

        `pcm` may start or end mid-sample-frame: the remainder is carried.
        """
        if not pcm:
            return b""
        data = self._partial + pcm if self._partial else pcm
        frame = 2 * channels
        usable = (len(data) // frame) * frame
        self._partial = data[usable:]
        if not usable:
            return b""

        x = np.frombuffer(data[:usable], dtype="<i2").astype(np.float32)
        if channels == 2:
            # The firmware duplicates the mono mic onto L and R. Averaging is
            # therefore lossless for that build, and the correct downmix if a
            # future build ever sends true stereo.
            x = x.reshape(-1, 2).mean(axis=1)
        self.samples_in += len(x)

        buf = np.concatenate((self._tail, x))
        # 'valid' emits exactly one output per new input sample, so consecutive
        # calls join seamlessly as long as the last n-1 inputs are carried.
        filtered = np.convolve(buf, self._h, mode="valid")
        self._tail = buf[-(len(self._h) - 1):].copy()

        filtered = np.concatenate((self._phase, filtered))
        ready = (len(filtered) // self.factor) * self.factor
        out = filtered[:ready:self.factor]
        self._phase = filtered[ready:].copy()

        self.samples_out += len(out)
        return np.clip(np.rint(out), -32768, 32767).astype("<i2").tobytes()
