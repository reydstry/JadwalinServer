function find(app, collection, filter, params) {
  return app.findRecordsByFilter(collection, filter, "", 1, 0, params)[0];
}

function ownerOf(app, schedule) {
  return app.findRecordById("mata_kuliah", schedule.getString("mata_kuliah")).getString("user");
}

function flat(row, course) {
  return {
        nama: course.getString("nama"), dosen: course.getString("dosen"), sks: course.getInt("sks"),
        hari: row.getInt("hari"), jam_mulai: row.getInt("jam_mulai"), jam_selesai: row.getInt("jam_selesai"),
        ruangan: row.getString("ruangan"), pengingat_aktif: row.getBool("pengingat_aktif"), menit_sebelum: row.getInt("menit_sebelum"),
  };
}

exports.pull = (e) => {
  const items = {};
  e.app.runInTransaction((app) => {
    const rows = app.findRecordsByFilter("jadwal", "mata_kuliah.user = {:owner}", "", 0, 0, {owner: e.auth.id});
    for (const row of rows) {
      const course = app.findRecordById("mata_kuliah", row.getString("mata_kuliah"));
      items[row.id] = flat(row, course);
    }
  });
  return e.json(200, {items});
};

exports.push = (e) => {
  const body = e.requestInfo().body;
  if (!/^[a-z0-9]{15}$/.test(body.op || "") || !/^[a-z0-9]{15}$/.test(body.id || "") ||
      !["create", "update", "delete"].includes(body.kind)) throw new BadRequestError("Operasi tidak valid.");
  const owner = e.auth.id;
  // Bind an idempotency key to its immutable body, including operation type.
  const payload = JSON.stringify([body.id, body.kind, ...["nama", "dosen", "sks", "hari", "jam_mulai", "jam_selesai", "ruangan", "pengingat_aktif", "menit_sebelum"].map((key) => body.data ? body.data[key] : null)]);
  let outcome;
  let item = null;
  e.app.runInTransaction((app) => {
    const receipt = find(app, "jadwalin_sync_receipts", "owner = {:owner} && operation = {:operation}", {owner, operation: body.op});
    if (receipt) {
      if (receipt.getString("payload") !== payload) throw new BadRequestError("Identitas operasi telah digunakan.");
      outcome = receipt.getString("outcome");
      const current = find(app, "jadwal", "id = {:id}", {id: body.id});
      if (current) item = flat(current, app.findRecordById("mata_kuliah", current.getString("mata_kuliah")));
      return;
    }
    const tombstone = find(app, "jadwalin_sync_deleted", "entity = {:entity}", {entity: body.id});
    const schedule = find(app, "jadwal", "id = {:id}", {id: body.id});
    if ((schedule && ownerOf(app, schedule) !== owner) ||
        (tombstone && tombstone.getString("owner") !== owner)) throw new NotFoundError();
    outcome = "applied";
    if (tombstone || (!schedule && body.kind === "update")) {
      outcome = "deleted";
    } else if (body.kind === "delete") {
      if (schedule) {
        require(__hooks + "/jadwalin_schedules.js").remove({
          app, auth: e.auth, request: {pathValue: () => body.id}, noContent: () => {},
        });
      } else {
        const marker = new Record(app.findCollectionByNameOrId("jadwalin_sync_deleted"));
        marker.set("owner", owner); marker.set("entity", body.id); app.save(marker);
      }
    } else if (!(schedule && body.kind === "create")) {
      require(__hooks + "/jadwalin_schedules.js").save({
        app, auth: e.auth, requestInfo: () => ({body: body.data || {}}),
        request: {pathValue: () => body.id}, json: () => {},
      }, body.kind === "update", body.id);
    }
    const committed = new Record(app.findCollectionByNameOrId("jadwalin_sync_receipts"));
    committed.set("owner", owner); committed.set("entity", body.id);
    committed.set("operation", body.op); committed.set("payload", payload);
    committed.set("outcome", outcome); app.save(committed);
    const current = find(app, "jadwal", "id = {:id}", {id: body.id});
    if (current) item = flat(current, app.findRecordById("mata_kuliah", current.getString("mata_kuliah")));
  });
  return e.json(200, {outcome, item});
};

exports.deleted = (e) => {
  e.app.runInTransaction((app) => {
    const owner = ownerOf(app, e.record);
    if (!find(app, "jadwalin_sync_deleted", "entity = {:entity}", {entity: e.record.id})) {
      const marker = new Record(app.findCollectionByNameOrId("jadwalin_sync_deleted"));
      marker.set("owner", owner); marker.set("entity", e.record.id); app.save(marker);
    }
    e.app = app;
    e.next();
  });
};
