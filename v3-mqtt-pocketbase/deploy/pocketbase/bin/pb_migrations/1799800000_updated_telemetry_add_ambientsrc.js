/// <reference path="../pb_data/types.d.ts" />
// 2026-11-21 — record which thermometer produced `ambient` on every row.
//
// The thermal node has two ambient sources and they are NOT interchangeable:
//
//   sht45         the SHT45 air probe beside the rig      (real barn air)
//   mlx-internal  the MLX90640's own die temperature      (self-heated)
//
// Measured 2026-11-04: the die read 43.6 C while the SHT45 read 31.1 C — a
// ~12.5 C self-heat gap. The fallback exists so the dashboard keeps drawing a
// heatmap when the SHT45 is unavailable, but a stored row that says
// `ambient=41.6` without this label is indistinguishable from a row that says
// `ambient=41.6` because the barn really was that hot. Any downstream research
// that regresses body temperature on ambient would silently mix die heat with
// air temperature and corrupt the model.
//
// PocketBase 0.24 silently DROPS fields a collection does not declare (see
// 1798100000 and 1799700000), so without this migration the publisher keeps
// sending `ambientSrc` and the database keeps discarding it.
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("dmexc02x8cfguql")

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ambsrcfld1",
    "name": "ambientSrc",
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

  collection.schema.removeField("ambsrcfld1")

  return dao.saveCollection(collection)
})
