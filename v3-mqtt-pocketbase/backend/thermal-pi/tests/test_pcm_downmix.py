#!/usr/bin/env python3
"""Numerical tests for pcm_downmix.py — no hardware, no network.

The claims that matter for the barn stream:
  * the anti-alias filter is flat where the audio lives and dead above 8 kHz,
  * output is exactly 16 kHz mono,
  * the byte stream survives arbitrary chunk splits unchanged (the network
    will split it, and a dropped partial sample is a permanent click).

    cd backend/thermal-pi && python3 -m unittest tests.test_pcm_downmix -v
"""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import pcm_downmix as pd  # noqa: E402


def response_db(h: np.ndarray, f: float, fs: float = 48000.0) -> float:
    n = 1 << 15
    w = np.abs(np.fft.rfft(h, n))
    freqs = np.fft.rfftfreq(n, 1.0 / fs)
    return float(20 * np.log10(max(np.interp(f, freqs, w), 1e-12)))


def stereo_tone(freq: float, seconds: float = 1.0, amp: int = 12000,
                rate: int = 48000) -> bytes:
    t = np.arange(int(rate * seconds)) / float(rate)
    mono = (np.sin(2 * np.pi * freq * t) * amp).astype("<i2")
    return np.repeat(mono, 2).astype("<i2").tobytes()


class FilterShapeTests(unittest.TestCase):

    def test_passband_is_flat(self):
        h = pd.design_lowpass()
        worst = max(abs(response_db(h, f)) for f in range(100, 6501, 100))
        self.assertLess(worst, 0.6, f"passband deviation {worst:.2f} dB")

    def test_stopband_kills_everything_above_nyquist(self):
        h = pd.design_lowpass()
        worst = max(response_db(h, f) for f in range(8000, 23001, 250))
        self.assertLess(worst, -55.0, f"stopband {worst:.1f} dB")

    def test_unity_dc_gain(self):
        self.assertAlmostEqual(float(pd.design_lowpass().sum()), 1.0, places=3)


class DownmixTests(unittest.TestCase):

    def test_rate_and_length(self):
        dm = pd.Downmixer(48000, 16000)
        out = dm.process(stereo_tone(1000, seconds=1.0))
        # 1 s in -> 1 s out, mono s16: 16000 samples = 32000 bytes (+-1 frame
        # while the 2.6 ms filter pipeline is still filling).
        self.assertLessEqual(abs(len(out) // 2 - 16000), 3)
        self.assertEqual(dm.samples_out, len(out) // 2)

    def test_chunk_boundaries_do_not_change_output(self):
        pcm = stereo_tone(1000, seconds=1.0)
        whole = pd.Downmixer(48000, 16000).process(pcm)
        for step in (8192, 1001, 4, 3):
            dm = pd.Downmixer(48000, 16000)
            parts = b"".join(dm.process(pcm[i:i + step])
                             for i in range(0, len(pcm), step))
            self.assertEqual(parts, whole, f"split at {step} bytes differs")

    def test_high_frequency_tone_is_removed(self):
        out = np.frombuffer(pd.Downmixer(48000, 16000).process(
            stereo_tone(12000)), dtype="<i2")
        rms = float(np.sqrt(np.mean(out.astype(np.float64) ** 2)))
        self.assertLess(rms, 30.0, f"12 kHz leaked through at RMS {rms:.1f}")

    def test_speech_band_tone_survives(self):
        out = np.frombuffer(pd.Downmixer(48000, 16000).process(
            stereo_tone(1000)), dtype="<i2")
        # Skip the filter warm-up before measuring.
        rms = float(np.sqrt(np.mean(out[200:].astype(np.float64) ** 2)))
        self.assertGreater(rms, 7000.0, f"1 kHz attenuated to RMS {rms:.1f}")

    def test_stereo_is_averaged(self):
        # L = +1000, R = -1000 -> mono 0 (proves a real downmix, not a copy).
        n = 4800
        inter = np.empty(n * 2, dtype="<i2")
        inter[0::2] = 1000
        inter[1::2] = -1000
        dm = pd.Downmixer(48000, 16000)
        out = np.frombuffer(dm.process(inter.tobytes()), dtype="<i2")
        self.assertEqual(int(np.abs(out).max()), 0)

    def test_mono_input_passes_through(self):
        dm = pd.Downmixer(48000, 16000)
        mono = np.full(4800, 512, dtype="<i2").tobytes()
        out = np.frombuffer(dm.process(mono, channels=1), dtype="<i2")
        self.assertGreater(len(out), 1500)

    def test_non_integer_ratio_is_refused(self):
        with self.assertRaises(ValueError):
            pd.Downmixer(44100, 16000)

    def test_empty_chunk_is_harmless(self):
        dm = pd.Downmixer(48000, 16000)
        self.assertEqual(dm.process(b""), b"")


if __name__ == "__main__":
    unittest.main(verbosity=2)
