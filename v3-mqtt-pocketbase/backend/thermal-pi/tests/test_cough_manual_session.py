import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "cough"))

from manual_session import ManualSession, validate_label  # noqa: E402


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
        self.assertIsNone(summary["false_positive_rate"])
        self.assertEqual(summary["recall"], 0.0)

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


if __name__ == "__main__":
    unittest.main()
