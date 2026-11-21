/// <reference path="../pb_data/types.d.ts" />
// 2026-11-21 — persist the radiometry pipeline's verdict.
//
// Before this migration the fever deliverable was computed and then discarded:
//
//   /data  ->  {"verdict":"HYPERTHERMIA","center":42.53,...}   (real, derived)
//   row    ->  {"verdict":"","bodyTemp":0,"temperature":0}      (all stripped)
//
// The bridge's thermal guard (backend/bridge/thermal_guard.py) strips
// `verdict`, `bodyTemp`, `alerts` and `temperature` from every telemetry
// payload on purpose: on 2026-11-02 Master ruled that an MLX90640 frame centre
// is a scene temperature, not a pig temperature, and the phone app was reading
// it as a fever. That ruling still holds and the guard is unchanged.
//
// What changed since is the pipeline: `verdict` is no longer the raw frame
// scalar. It is produced by radiometry.py from per-pixel drift correction,
// a rolling baseline and zone classification, and `center` is the worst
// zone's peak. So the derived claim is worth storing — under a name the guard
// cannot confuse with a raw claim:
//
//   pipelineVerdict  text  WARMUP | NORMAL | SUSPECT | FEVER | HYPERTHERMIA
//
// `heatStressCon` (THI >= 78) already annotates whether an absolute
// HYPERTHERMIA is a heat-stress confound rather than a true fever.
//
// PocketBase 0.24 silently DROPS fields a collection does not declare (see
// 1798100000, 1799700000, 1799800000), so without this the publisher keeps
// sending `pipelineVerdict` and the database keeps discarding it.
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("dmexc02x8cfguql")

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "plnverdict1",
    "name": "pipelineVerdict",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": { "min": null, "max": null, "pattern": "" }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("dmexc02x8cfguql")

  collection.schema.removeField("plnverdict1")

  return dao.saveCollection(collection)
})
