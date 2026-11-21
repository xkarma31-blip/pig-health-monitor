/// <reference path="../pb_data/types.d.ts" />
// 2026-11-21 — Jia et al. (2020) heat-stress confound on the telemetry collection.
//
// The thermal node now models humidity alongside ambient (SHT45), because a
// humid tropical pen reads every pig as feverish if humidity is ignored:
//
//   {"deviceId":"pi-thermal-01","ambient":31.0,"humidity":78.0,"thi":79.3,
//    "heatStressCon":true,"verdict":"FEVER",...}
//
// `thi` is the Temperature-Humidity Index (ambient_ingest.snapshot computes it:
//   THI = (1.8T+32) - (0.55-0.0055*RH)*(1.8T-26)). Bands: <74 ok, 74-78 mild,
// 78-82 moderate, >=82 severe. `heatStressCon` is true when THI >= 78 — the
// verdict is then a heat-stress confound, not a true fever.
//
// PocketBase 0.24 silently DROPS fields a collection does not declare (see
// 1798100000 for the full post-mortem on this exact failure mode). Without
// this migration the bridge would accept the MQTT message, POST it, get HTTP
// 200 back, and store a row with thi/heatStressCon simply missing — the
// research audit would never see the humidity term that Jia requires.
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("dmexc02x8cfguql")

  // Temperature-Humidity Index (unitless °F-scale index; see ambient_ingest).
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "thmfldth1",
    "name": "thi",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": { "min": null, "max": null, "noDecimal": false }
  }))

  // True when THI >= 78 (moderate+ heat stress): the fever verdict is a
  // heat-stress confound, not a diagnosis. Boolean so the research filter is
  // a single `heatStressCon = true` clause.
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "thmfldhsc1",
    "name": "heatStressCon",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("dmexc02x8cfguql")

  collection.schema.removeField("thmfldth1")
  collection.schema.removeField("thmfldhsc1")

  return dao.saveCollection(collection)
})