/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_16258805")

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": false,
    "collectionId": "_pb_users_auth_",
    "help": "",
    "hidden": false,
    "id": "relation344172009",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "users",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1498331679",
    "max": 0,
    "min": 0,
    "name": "nama",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text769836145",
    "max": 0,
    "min": 0,
    "name": "dosen",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "number3874725361",
    "max": 10,
    "min": 1,
    "name": "sks",
    "onlyInt": true,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_16258805")

  // remove field
  collection.fields.removeById("relation344172009")

  // remove field
  collection.fields.removeById("text1498331679")

  // remove field
  collection.fields.removeById("text769836145")

  // remove field
  collection.fields.removeById("number3874725361")

  return app.save(collection)
})
