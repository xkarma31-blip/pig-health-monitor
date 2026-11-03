"""Regression coverage for acknowledgement, failure accounting, and quarantine (stdlib only)."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "cloud_sync", Path(__file__).resolve().parents[1] / "cloud_sync.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class Endpoint:
    def __init__(self, records=(), available=True, insert_ok=True):
        self.records = list(records)
        self.available = available
        self.insert_ok = insert_ok
        self.inserted = []
        self.acked = []

    def ensure(self):
        return self.available

    def unsynced(self, collection):
        return self.records if collection == "telemetry" else []

    def insert(self, collection, payload):
        self.inserted.append(payload)
        return self.insert_ok

    def mark_synced(self, collection, record_id):
        self.acked.append(record_id)
        return True


class SyncTests(unittest.TestCase):
    def setUp(self):
        sync._quarantine.clear()

    def test_failed_fetch_is_not_an_empty_success(self):
        source = Endpoint()
        source.unsynced = lambda collection: None
        result = sync.sync_once(source, Endpoint())
        self.assertEqual(result["failed"], len(sync.SYNCED_COLLECTIONS))
        self.assertEqual(source.acked, [])

    def test_old_reading_is_delivered_before_acknowledgement(self):
        source = Endpoint([{"id": "old", "timestamp": 1000, "synced": False}])
        dest = Endpoint(insert_ok=False)
        result = sync.sync_once(source, dest)
        self.assertEqual(source.acked, [])
        self.assertEqual(result["failed"], 1)
        dest.insert_ok = True
        result = sync.sync_once(source, dest)
        self.assertEqual(source.acked, ["old"])
        # Delivered with its corrected stamp: the era map applies to every
        # source row (toy stamp 1000 ms -> Era 0 offset -> seconds).
        self.assertEqual(dest.inserted[-1]["timestamp"], 246_037)
        self.assertEqual(result["sent"], 1)

    def test_unreachable_source_is_failure(self):
        self.assertEqual(sync.sync_once(Endpoint(available=False), Endpoint())["failed"], 1)

    def test_unreachable_destination_is_failure(self):
        source = Endpoint([{"id": "x"}])
        self.assertEqual(sync.sync_once(source, Endpoint(available=False))["failed"], 1)
        self.assertEqual(source.acked, [])

    def test_dry_run_never_inserts_or_acknowledges_old_data(self):
        source = Endpoint([{"id": "old", "timestamp": 1000}])
        dest = Endpoint()
        sync.sync_once(source, dest, dry_run=True)
        self.assertEqual(source.acked, [])
        self.assertEqual(dest.inserted, [])

    def test_persistently_rejected_record_is_quarantined_not_dropped(self):
        source = Endpoint([{"id": "poison", "timestamp": 2000}])
        dest = Endpoint(insert_ok=False)
        # Cap failures, then one more (the cap boundary itself is a probe pass).
        for _ in range(sync.QUARANTINE_AFTER + 1):
            result = sync.sync_once(source, dest)
            self.assertEqual(source.acked, [])
            self.assertEqual(result["failed"], 1)
        # Next pass backs off (attempt count is not a cap multiple): no
        # attempt, no new failure, record untouched on the source.
        result = sync.sync_once(source, dest)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["quarantined"], 1)
        self.assertEqual(source.acked, [])  # never silently marked synced
        self.assertEqual(source.records[0]["id"], "poison")  # never deleted

    def test_recovery_clears_quarantine(self):
        source = Endpoint([{"id": "flaky", "timestamp": 3000}])
        dest = Endpoint(insert_ok=False)
        for _ in range(sync.QUARANTINE_AFTER):
            sync.sync_once(source, dest)
        dest.insert_ok = True  # schema fixed / destination recovered
        result = sync.sync_once(source, dest)
        self.assertEqual(result["sent"], 1)
        self.assertEqual(source.acked, ["flaky"])

    def test_quarantine_is_per_record_not_global(self):
        source = Endpoint([
            {"id": "poison", "timestamp": 4000, "tag": "poison"},
            {"id": "healthy", "timestamp": 5000, "tag": "healthy"},
        ])
        dest = Endpoint()

        # Key on a field that survives strip_server_fields AND the T2 era
        # correction (which rewrites timestamps in flight).
        def conditional_insert(collection, payload):
            return payload.get("tag") != "poison"

        dest.insert = conditional_insert
        for _ in range(sync.QUARANTINE_AFTER + 1):
            sync.sync_once(source, dest)
        self.assertIn("healthy", source.acked)
        self.assertNotIn("poison", source.acked)


# ── T2: in-flight correction ─────────────────────────────────────────────────
# Grounded in the live Pi pull of 2026-11-03 (/tmp/opencode/pi_eras_live.out):
# the Pi wall clock stepped +2.85 d around 2026-10-01 and +32.83 d at the
# systemd-timesyncd first sync (2026-11-02T22:32:11Z). The offsets are exact
# to the millisecond: corrected(Era0_last) == Era1_first_raw and
# corrected(Era1_last) == Era2_first_raw. Era 3 (the 2026-11-03 reboot, clock
# 2 h 25 m 15 s behind until the anchored-bridge redeploy) is grounded in the
# same-day boundary scan: first settled row of the rebooted bridge, and a
# verified-empty raw gap to the first anchored row.

ERA0_LAST_RAW = 1_790_573_434_379   # 2026-09-28T05:30:34.379Z, as the Pi clock read it
ERA1_FIRST_RAW = 1_790_819_471_315  # 2026-10-01T01:51:11.315Z, raw
ERA1_LAST_RAW = 1_790_822_405_896   # 2026-10-01T02:40:05.896Z, raw
ERA2_FIRST_RAW = 1_793_658_731_063  # 2026-11-02T22:32:11.063Z — already true time
ERA2_LAST_RAW = 1_793_689_227_885   # 2026-11-03T07:00:27.885Z raw — last clean pre-reboot row
ERA3_FIRST_RAW = 1_793_689_301_461  # first settled row of the rebooted bridge (raw; true = raw + ERA3_OFFSET_MS)
ERA3_LAST_RAW = 1_793_697_285_165   # 2026-11-03T09:14:45.165Z raw — last stale-clock row before redeploy
ERA4_FIRST_RAW = 1_793_706_012_596  # 2026-11-03T11:40:12.596Z — first anchored (true-time) row
ERA3_OFFSET_MS = 8_715_000          # fake-hwclock restored a 2 h 25 m 15 s stale snapshot


class CorrectionTests(unittest.TestCase):
    def test_era_offsets_map_raw_pi_stamps_to_true_time(self):
        self.assertEqual(
            sync.correct_source_timestamp(ERA0_LAST_RAW), ERA1_FIRST_RAW)
        self.assertEqual(
            sync.correct_source_timestamp(ERA1_LAST_RAW), ERA2_FIRST_RAW)
        self.assertEqual(
            sync.correct_source_timestamp(ERA2_FIRST_RAW), ERA2_FIRST_RAW)

    def test_era3_reboot_stale_clock_is_corrected(self):
        # 2026-11-03: the Pi rebooted with no WAN and fake-hwclock restored a
        # snapshot 2 h 25 m 15 s stale (measured 3x against the laptop NTP
        # clock). The anchored-bridge redeploy froze the era; the raw gap to
        # the first anchored row was verified empty.
        self.assertEqual(
            sync.correct_source_timestamp(ERA2_LAST_RAW), ERA2_LAST_RAW)
        self.assertEqual(
            sync.correct_source_timestamp(ERA3_FIRST_RAW),
            ERA3_FIRST_RAW + ERA3_OFFSET_MS)
        self.assertEqual(
            sync.correct_source_timestamp(ERA3_LAST_RAW), 1_793_706_000_165)
        self.assertEqual(
            sync.correct_source_timestamp(ERA4_FIRST_RAW), ERA4_FIRST_RAW)

    def test_era3_correction_lands_between_its_neighbors(self):
        # The corrected era-3 window must sit strictly between the last true
        # era-2 row and the first anchored era-4 row — no wrap, no collision.
        stamps = [sync.correct_source_timestamp(r) for r in
                  (ERA2_LAST_RAW, ERA3_FIRST_RAW, ERA3_LAST_RAW,
                   ERA4_FIRST_RAW)]
        self.assertEqual(stamps, sorted(stamps))
        self.assertEqual(len(set(stamps)), len(stamps))

    def test_destination_timestamps_are_integer_seconds(self):
        # The laptop's legacy rows are seconds; PocketBase `sort=-timestamp`
        # breaks on mixed units, so the destination always gets seconds.
        for raw in (ERA0_LAST_RAW, ERA1_LAST_RAW, ERA2_FIRST_RAW,
                    ERA3_LAST_RAW, ERA4_FIRST_RAW):
            stamp = sync.to_dest_timestamp(raw)
            self.assertIsInstance(stamp, int)
            self.assertLess(stamp, 1_000_000_000_000)  # not milliseconds
        self.assertEqual(sync.to_dest_timestamp(ERA2_FIRST_RAW), 1_793_658_731)
        self.assertEqual(sync.to_dest_timestamp(ERA3_LAST_RAW), 1_793_706_000)

    def test_missing_or_nonnumeric_timestamp_passes_through(self):
        self.assertIsNone(sync.correct_source_timestamp(None))
        self.assertEqual(sync.correct_source_timestamp("oops"), "oops")


class SyncGuardTests(unittest.TestCase):
    """The thermal guard applies in flight: the cloud never receives the
    pig-temperature claim, and thermal alert rows are never delivered."""

    def test_thermal_claims_stripped_and_timestamp_in_seconds(self):
        source = Endpoint([{
            "id": "t1", "timestamp": ERA2_FIRST_RAW, "synced": False,
            "bodyTemp": 476.89, "temperature": 400.1,
            "status": "OUT_OF_BAND", "verdict": "OUT_OF_BAND", "alerts": 1,
            "center": 476.89, "hotspot": 480.2, "min": 31.0, "ambient": 49.3,
        }])
        dest = Endpoint()
        result = sync.sync_once(source, dest)
        payload = dest.inserted[0]
        for field in ("bodyTemp", "temperature", "status", "verdict", "alerts"):
            self.assertNotIn(field, payload)
        self.assertEqual(payload["center"], 476.89)            # raw value survives
        self.assertEqual(payload["timestamp"], 1_793_658_731)  # seconds
        self.assertTrue(payload["synced"])
        self.assertEqual(result["sent"], 1)

    def test_mic_ambient_is_rehomed_not_lost(self):
        source = Endpoint([{
            "id": "m1", "timestamp": ERA2_FIRST_RAW, "synced": False,
            "mic": True, "rms": 23991, "peak": 62092, "sr": 48000,
            "humidity": 55.5, "temperature": 31.11,
            "bodyTemp": 0, "status": "", "verdict": "", "alerts": 0,
        }])
        dest = Endpoint()
        sync.sync_once(source, dest)
        payload = dest.inserted[0]
        self.assertNotIn("temperature", payload)
        self.assertEqual(payload["ambient"], 31.11)
        self.assertEqual(payload["humidity"], 55.5)

    def test_device_status_survives_the_guard(self):
        source = Endpoint([{"id": "d1", "timestamp": ERA2_FIRST_RAW,
                            "deviceId": "s3-mic-01", "status": "online"}])
        dest = Endpoint()
        sync.sync_once(source, dest)
        self.assertEqual(dest.inserted[0]["status"], "online")

    def test_thermal_alert_rows_are_suppressed_not_delivered(self):
        source = Endpoint()
        source.unsynced = lambda collection: (
            [{"id": "bad", "timestamp": ERA2_FIRST_RAW, "synced": False,
              "type": "HYPERTHERMIA", "severity": "critical"}]
            if collection == "alerts" else [])
        dest = Endpoint()
        result = sync.sync_once(source, dest)
        self.assertEqual(dest.inserted, [])      # never forwarded
        self.assertEqual(source.acked, ["bad"])  # marked handled, not retried
        self.assertEqual(result["suppressed"], 1)

    def test_unrelated_alerts_still_flow(self):
        source = Endpoint()
        source.unsynced = lambda collection: (
            [{"id": "mic1", "timestamp": ERA2_FIRST_RAW, "synced": False,
              "type": "MIC_DISCONNECTED", "severity": "warning"}]
            if collection == "alerts" else [])
        dest = Endpoint()
        result = sync.sync_once(source, dest)
        self.assertEqual(len(dest.inserted), 1)
        self.assertEqual(result["suppressed"], 0)
        self.assertEqual(source.acked, ["mic1"])


if __name__ == "__main__":
    unittest.main()
