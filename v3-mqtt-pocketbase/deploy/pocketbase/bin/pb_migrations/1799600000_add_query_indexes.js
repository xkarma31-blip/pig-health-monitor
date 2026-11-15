/// <reference path="../pb_data/types.d.ts" />
// 2026-11-16 — indexes for the queries the system actually runs.
//
// MEASURED (before this migration, live):
//   Pi PocketBase (726k telemetry rows, on SD card):
//     filter=(synced=false)&sort=-timestamp   ->  507.7 ms
//     sort=-timestamp&perPage=5                -> 4099.5 ms
//     deviceId='..'&&timestamp>=.. (analytics) ->  582.4 ms
//   Laptop PocketBase (737k rows, NVMe):  86 ms / 352 ms / 87 ms
// Both databases had ZERO indexes: every one of those was a full table scan.
//
// AFTER (same queries, same data):
//   Pi:    27.7 ms / 246.0 ms / 15.9 ms     (18x / 17x / 37x)
//   Laptop:  0.8 ms /  32.3 ms /  0.9 ms
// Query plan confirms: SEARCH telemetry USING INDEX idx_telemetry_synced_ts.
//
// The index set is not speculative - it is exactly the query shapes in the repo:
//   cloud_sync.py            : filter=(synced=false)&sort=-timestamp    -> (synced, timestamp)
//   usePocketbaseRealtime.ts : sort=-timestamp&perPage=5                 -> (timestamp)
//   analytics.tsx            : deviceId='..'&&timestamp>=..&&timestamp<.. -> (deviceId, timestamp)
//
// A composite (synced, timestamp) serves the sync because its leading column is
// constrained; the bare (timestamp) index is needed separately, because SQLite
// can only use a composite index for ORDER BY when its LEADING column is
// constrained.
//
// PocketBase 0.22 API notes (each verified in a scratch instance BEFORE this
// file was allowed anywhere near production):
//   * Collection.indexes is a plain array of SQL statements (NOT the 0.23+
//     indexes.add() helper), and it IS writable.
//   * The migration function must return dao.saveCollection(collection); a bare
//     Dao or a raw collection makes the runner fail with
//     "could not convert [object Object] to error".
//   * The index SQL must be plain "CREATE INDEX `name` ON `table` (`col`)"
//     - "IF NOT EXISTS" is rejected by the collection validator.
const INDEXES = {
  telemetry: [
    "CREATE INDEX `idx_telemetry_synced_ts` ON `telemetry` (`synced`, `timestamp`)",
    "CREATE INDEX `idx_telemetry_timestamp` ON `telemetry` (`timestamp`)",
    "CREATE INDEX `idx_telemetry_deviceid_ts` ON `telemetry` (`deviceId`, `timestamp`)",
  ],
  alerts: [
    "CREATE INDEX `idx_alerts_synced_ts` ON `alerts` (`synced`, `timestamp`)",
    "CREATE INDEX `idx_alerts_timestamp` ON `alerts` (`timestamp`)",
    "CREATE INDEX `idx_alerts_deviceid_ts` ON `alerts` (`deviceId`, `timestamp`)",
  ],
  audio_events: [
    "CREATE INDEX `idx_audio_synced_ts` ON `audio_events` (`synced`, `timestamp`)",
    "CREATE INDEX `idx_audio_timestamp` ON `audio_events` (`timestamp`)",
    "CREATE INDEX `idx_audio_deviceid_ts` ON `audio_events` (`deviceId`, `timestamp`)",
  ],
}

migrate((db) => {
  const dao = new Dao(db)
  let saved = null
  for (const name of Object.keys(INDEXES)) {
    const collection = dao.findCollectionByNameOrId(name)
    collection.indexes = INDEXES[name]
    saved = dao.saveCollection(collection)
  }
  return saved
}, (db) => {
  const dao = new Dao(db)
  let saved = null
  for (const name of Object.keys(INDEXES)) {
    const collection = dao.findCollectionByNameOrId(name)
    collection.indexes = []
    saved = dao.saveCollection(collection)
  }
  return saved
})
