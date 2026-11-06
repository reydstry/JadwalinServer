/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1458882360")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && mata_kuliah.user = @request.auth.id",
    "deleteRule": "@request.auth.id != \"\" && mata_kuliah.user = @request.auth.id",
    "listRule": "@request.auth.id != \"\" && mata_kuliah.user = @request.auth.id",
    "updateRule": "@request.auth.id != \"\" &&\nmata_kuliah.user = @request.auth.id &&\n@request.body.mata_kuliah:changed = false",
    "viewRule": "@request.auth.id != \"\" && mata_kuliah.user = @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1458882360")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": null,
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
