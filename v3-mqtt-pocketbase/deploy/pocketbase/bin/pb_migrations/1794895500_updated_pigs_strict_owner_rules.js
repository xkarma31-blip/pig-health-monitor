/// <reference path="../pb_data/types.d.ts" />
// 2026-11-17 — close the owner-enforcement review gaps.
//
// The first owner migration required only that SOME authenticated user create
// a row; the client-stamped ownerId was not bound to that identity. This
// amendment binds create/update/delete to the authenticated owner and marks
// pre-migration rows as legacy-admin owned so they are no longer silently
// unowned. Admin tooling bypasses collection rules and remains the recovery
// path for legacy records.
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("9erjpju2awfsczb")
  const strict = '@request.auth.id != "" && ownerId = @request.auth.id'

  collection.createRule = strict
  collection.updateRule = strict
  collection.deleteRule = strict
  dao.saveCollection(collection)

  const legacy = dao.findRecordsByFilter("pigs", "ownerId = ''", "", 500, 0)
  for (const record of legacy) {
    record.set("ownerId", "legacy-admin")
    dao.saveRecord(record)
  }

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("9erjpju2awfsczb")

  collection.createRule = '@request.auth.id != ""'
  collection.updateRule = '@request.auth.id != ""'
  collection.deleteRule = '@request.auth.id != ""'

  const legacy = dao.findRecordsByFilter("pigs", "ownerId = 'legacy-admin'", "", 500, 0)
  for (const record of legacy) {
    record.set("ownerId", "")
    dao.saveRecord(record)
  }

  return dao.saveCollection(collection)
})
