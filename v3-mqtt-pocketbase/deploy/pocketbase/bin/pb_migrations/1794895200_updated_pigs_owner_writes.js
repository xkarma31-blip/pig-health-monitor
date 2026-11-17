/// <reference path="../pb_data/types.d.ts" />
// 2026-11-17 — auth-for-writes only.
//
// Reads stay open so a skipped/guest user can still inspect herd data, but a
// pig record may only be created, updated or deleted by a signed-in end user
// who owns it. The app stamps ownerId from the authenticated session; the
// collection rule is the real enforcement boundary, not the client UI gate.
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("9erjpju2awfsczb")

  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "pignownr",
    "name": "ownerId",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": { "min": null, "max": 150, "pattern": "" }
  }))

  collection.createRule = "@request.auth.id != \"\""
  collection.updateRule = "@request.auth.id != \"\" && ownerId = @request.auth.id"
  collection.deleteRule = "@request.auth.id != \"\" && ownerId = @request.auth.id"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("9erjpju2awfsczb")

  collection.schema.removeField("pignownr")
  collection.createRule = ""
  collection.updateRule = "@request.auth.id != \"\""
  collection.deleteRule = "@request.auth.id != \"\""

  return dao.saveCollection(collection)
})
