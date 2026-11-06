/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const schedules = app.findCollectionByNameOrId("jadwal");
  schedules.fields.add(new NumberField({
    id: "number1944428074", name: "jam_selesai", required: true,
    onlyInt: true, min: 1, max: 1439,
  }));
  schedules.fields.add(new BoolField({
    id: "bool220919373", name: "pengingat_aktif",
  }));
  app.save(schedules);

  app.save(new Collection({
    name: "jadwalin_email_challenges", type: "base",
    listRule: null, viewRule: null, createRule: null,
    updateRule: null, deleteRule: null,
    fields: [
      {name: "email", type: "email", required: true},
      {name: "purpose", type: "text", required: true},
      {name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1},
      {name: "code_hash", type: "text", hidden: true},
      {name: "grant_hash", type: "text", hidden: true},
      {name: "requested_at", type: "number", onlyInt: true},
      {name: "expires_at", type: "number", onlyInt: true},
      {name: "grant_expires_at", type: "number", onlyInt: true},
      {name: "attempts", type: "number", onlyInt: true},
      {name: "verified", type: "bool"},
      {name: "consumed", type: "bool"},
      {name: "request_ip", type: "text", hidden: true},
    ],
    indexes: [
      "CREATE INDEX idx_jadwalin_code_email ON jadwalin_email_challenges (email, purpose, requested_at)",
      "CREATE INDEX idx_jadwalin_code_ip ON jadwalin_email_challenges (request_ip, requested_at)",
    ],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("jadwalin_email_challenges"));
  const schedules = app.findCollectionByNameOrId("jadwal");
  schedules.fields.removeById("number1944428074");
  schedules.fields.removeById("bool220919373");
  app.save(schedules);
});
