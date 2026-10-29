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
        self.assertEqual(dest.inserted[-1]["timestamp"], 1000)
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
            {"id": "poison", "timestamp": 4000},
            {"id": "healthy", "timestamp": 5000},
        ])
        dest = Endpoint()

        # strip_server_fields removes "id", so key on a field that survives
        # the payload: the poison record's timestamp.
        def conditional_insert(collection, payload):
            return payload.get("timestamp") != 4000

        dest.insert = conditional_insert
        for _ in range(sync.QUARANTINE_AFTER + 1):
            sync.sync_once(source, dest)
        self.assertIn("healthy", source.acked)
        self.assertNotIn("poison", source.acked)


if __name__ == "__main__":
    unittest.main()
