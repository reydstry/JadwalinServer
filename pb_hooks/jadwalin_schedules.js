function fail(code, message) {
  throw new BadRequestError(message, {
    reason: new ValidationError(code, message),
  });
}

function ownCourse(app, record, owner) {
  const course = app.findRecordById("mata_kuliah", record.getString("mata_kuliah"));
  if (course.getString("user") !== owner) throw new NotFoundError();
  return course;
}

function validate(app, record, owner) {
  ownCourse(app, record, owner);
  const start = record.getInt("jam_mulai");
  const end = record.getInt("jam_selesai");
  const day = record.getInt("hari");
  const reminder = record.getInt("menit_sebelum");
  if (day < 1 || day > 7 || start < 0 || end > 1439 || end <= start ||
      !record.getString("ruangan").trim() || reminder < 5 || reminder > 60 || reminder % 5) {
    fail("invalid_schedule", "Isian jadwal tidak valid.");
  }
  const conflicts = app.findRecordsByFilter("jadwal",
    "mata_kuliah.user = {:owner} && hari = {:day} && id != {:id} && " +
    "jam_mulai <= {:end} && jam_selesai >= {:start}", "", 1, 0,
    {owner, day, id: record.id, start, end});
  if (conflicts.length) {
    fail("schedule_conflict", "Jadwal bentrok. Beri jarak minimal 1 menit antarkuliah.");
  }
}

function exported(schedule, course) {
  const result = schedule.publicExport();
  result.expand = {mata_kuliah: course.publicExport()};
  return result;
}

exports.save = (e, editing) => {
  const body = e.requestInfo().body;
  const owner = e.auth.id;
  let result;
  e.app.runInTransaction((app) => {
    const schedule = editing
      ? app.findRecordById("jadwal", e.request.pathValue("id"))
      : new Record(app.findCollectionByNameOrId("jadwal"));
    const course = editing ? ownCourse(app, schedule, owner)
      : new Record(app.findCollectionByNameOrId("mata_kuliah"));
    const name = String(body.nama || "").trim();
    const lecturer = String(body.dosen || "").trim();
    if (!name || !lecturer || !Number.isInteger(body.sks) || body.sks < 1 || body.sks > 6) {
      fail("invalid_schedule", "Nama, dosen, dan SKS wajib diisi dengan benar.");
    }
    for (const field of ["hari", "jam_mulai", "jam_selesai", "menit_sebelum"]) {
      if (!Number.isInteger(body[field])) fail("invalid_schedule", "Waktu jadwal tidak valid.");
      schedule.set(field, body[field]);
    }
    if (typeof body.pengingat_aktif !== "boolean") {
      fail("invalid_schedule", "Pengaturan pengingat tidak valid.");
    }
    course.set("user", owner);
    course.set("nama", name);
    course.set("dosen", lecturer);
    course.set("sks", body.sks);
    app.save(course);
    schedule.set("mata_kuliah", course.id);
    schedule.set("ruangan", String(body.ruangan || "").trim());
    schedule.set("pengingat_aktif", body.pengingat_aktif);
    validate(app, schedule, owner);
    app.save(schedule);
    result = exported(schedule, course);
  });
  return e.json(200, result);
};

exports.remove = (e) => {
  e.app.runInTransaction((app) => {
    const schedule = app.findRecordById("jadwal", e.request.pathValue("id"));
    const course = ownCourse(app, schedule, e.auth.id);
    app.delete(schedule);
    const remaining = app.findRecordsByFilter("jadwal", "mata_kuliah = {:course}",
      "", 1, 0, {course: course.id});
    if (!remaining.length) app.delete(course);
  });
  return e.noContent(204);
};

// Menjaga validasi yang sama pada API koleksi standar dan endpoint transaksi.
exports.validateRequest = (e) => {
  if (!e.auth) throw new UnauthorizedError();
  e.app.runInTransaction((app) => {
    e.app = app;
    validate(app, e.record, e.auth.id);
    e.next();
  });
};
