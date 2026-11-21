import pathlib
import struct
import sys
import tempfile
import unittest
import wave

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "cough"))

from manual_session import ManualSession, validate_label  # noqa: E402
from manual_session import resolve_clip, read_wav_window  # noqa: E402


class TestValidateLabel(unittest.TestCase):
    def test_accepts_only_exact_labels(self):
        self.assertEqual(validate_label("cough"), "cough")
        self.assertEqual(validate_label("other"), "other")
        for bad in ("COUGH", "noise", "", None, 1):
            with self.assertRaises(ValueError):
                validate_label(bad)


class TestManualSession(unittest.TestCase):
    def test_counts_all_four_confusion_cells(self):
        s = ManualSession()
        s.record("cough", "cough", {"p": 0.9})
        s.record("cough", "other", {"p": 0.1})
        s.record("other", "cough", {"p": 0.8})
        s.record("other", "other", {"p": 0.2})
        summary = s.summary()
        self.assertEqual(summary["windows"], 4)
        self.assertEqual(summary["tp"], 1)
        self.assertEqual(summary["fp"], 1)
        self.assertEqual(summary["fn"], 1)
        self.assertEqual(summary["tn"], 1)
        self.assertEqual(summary["accuracy"], 0.5)
        self.assertEqual(summary["precision"], 0.5)
        self.assertEqual(summary["recall"], 0.5)
        self.assertEqual(summary["false_positive_rate"], 0.5)

    def test_undefined_metrics_are_null(self):
        s = ManualSession()
        s.record("other", "other", {"p": 0.01})
        summary = s.summary()
        self.assertIsNone(summary["precision"])
        self.assertEqual(summary["false_positive_rate"], 0.0)
        self.assertIsNone(summary["recall"])

    def test_last_result_carries_label_prediction_and_correctness(self):
        s = ManualSession()
        s.record("other", "cough", {"p": 0.7})
        self.assertEqual(s.last["label"], "other")
        self.assertEqual(s.last["predicted"], "cough")
        self.assertFalse(s.last["correct"])

    def test_reset_clears_everything_and_changes_session_id(self):
        s = ManualSession()
        old_id = s.session_id
        s.record("cough", "cough", {"p": 0.9})
        new_id = s.reset()
        self.assertNotEqual(new_id, old_id)
        self.assertEqual(new_id, s.session_id)
        self.assertEqual(s.summary()["windows"], 0)
        self.assertIsNone(s.last)


class TestClipValidation(unittest.TestCase):
    def _write_wav(self, path, frames=80000, rate=16000, channels=1, width=2,
                   samples=None):
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(width)
            wf.setframerate(rate)
            if samples is None:
                raw = b"\x00" * frames * channels * width
            else:
                raw = b"".join(struct.pack("<h", int(s)) for s in samples)
                raw += b"\x00" * (frames - len(samples)) * channels * width
            wf.writeframes(raw)

    def test_valid_nested_clip_resolves_and_loads_float_window(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            nested = root / "20261121"
            nested.mkdir()
            clip = nested / "ok.wav"
            self._write_wav(clip)
            self.assertEqual(resolve_clip("20261121/ok.wav", root), clip)
            w = read_wav_window(clip)
            self.assertEqual(w.shape, (80000,))
            self.assertEqual(float(w.max()), 0.0)

    def test_exact_float_conversion(self):
        with tempfile.TemporaryDirectory() as td:
            clip = pathlib.Path(td) / "exact.wav"
            self._write_wav(clip, samples=[-32768, 0, 32767])
            w = read_wav_window(clip)
            self.assertAlmostEqual(float(w[0]), -1.0)
            self.assertEqual(float(w[1]), 0.0)
            self.assertAlmostEqual(float(w[2]), 32767 / 32768.0)

    def test_traversal_absolute_sibling_prefix_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            base = pathlib.Path(td)
            root = base / "clips"
            root.mkdir()
            outside = base / "outside.wav"
            self._write_wav(outside)
            sibling = base / "clips_evil"
            sibling.mkdir()
            sibling_clip = sibling / "secret.wav"
            self._write_wav(sibling_clip)
            link = root / "link.wav"
            try:
                link.symlink_to(outside)
            except OSError:
                link = None
            with self.assertRaises(ValueError):
                resolve_clip("../outside.wav", root)
            with self.assertRaises(ValueError):
                resolve_clip(str(outside), root)
            with self.assertRaises(ValueError):
                resolve_clip("../clips_evil/secret.wav", root)
            if link is not None:
                with self.assertRaises(ValueError):
                    resolve_clip("link.wav", root)

    def test_missing_file_and_directory_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            (root / "adir").mkdir()
            with self.assertRaises(ValueError):
                resolve_clip("missing.wav", root)
            with self.assertRaises(ValueError):
                resolve_clip("adir", root)

    def test_wrong_rate_channels_width_or_length_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            cases = {
                "rate.wav": dict(rate=8000),
                "ch.wav": dict(channels=2),
                "width.wav": dict(width=1),
                "short.wav": dict(frames=40000),
                "long.wav": dict(frames=80001),
            }
            paths = []
            for name, kwargs in cases.items():
                p = root / name
                self._write_wav(p, **kwargs)
                paths.append(p)
            for p in paths:
                with self.assertRaises(ValueError):
                    read_wav_window(p)

    def test_malformed_wav_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = pathlib.Path(td) / "bad.wav"
            p.write_bytes(b"not a wav file")
            with self.assertRaises(ValueError):
                read_wav_window(p)


if __name__ == "__main__":
    unittest.main()
