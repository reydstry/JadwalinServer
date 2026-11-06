const collection = "jadwalin_email_challenges";

function fail(status, code, message) {
  throw new ApiError(status, message, {
    reason: new ValidationError(code, message),
  });
}

function identity(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const purpose = String(body.purpose || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !["registration", "passwordRecovery"].includes(purpose)) {
    fail(400, "invalid_input", "Email atau tujuan kode tidak valid.");
  }
  return {email, purpose};
}

exports.requestCode = (e) => {
  const body = e.requestInfo().body;
  const input = identity(body);
  const now = Date.now();
  let challenge;
  let user;
  const code = $security.randomStringWithAlphabet(6, "0123456789");

  e.app.runInTransaction((app) => {
    const previous = app.findRecordsByFilter(collection,
      "email = {:email} && purpose = {:purpose} && requested_at > {:after}",
      "", 1, 0, {...input, after: now - 60000});
    if (previous.length) {
      fail(429, "over_request_rate_limit", "Tunggu sebelum meminta kode baru.");
    }
    const recent = app.findRecordsByFilter(collection,
      "request_ip = {:ip} && requested_at > {:after}", "", 5, 0,
      {ip: e.realIP(), after: now - 600000});
    if (recent.length >= 5) {
      fail(429, "over_request_rate_limit", "Terlalu banyak permintaan kode.");
    }
    const users = app.findRecordsByFilter("users", "email = {:email}",
      "", 1, 0, {email: input.email});
    user = users.length ? users[0] : null;
    // Membatalkan kode sebelumnya juga membatalkan grant yang belum dipakai.
    const active = app.findRecordsByFilter(collection,
      "email = {:email} && purpose = {:purpose} && consumed = false",
      "", 100, 0, input);
    for (const item of active) {
      item.set("consumed", true);
      app.save(item);
    }
    challenge = new Record(app.findCollectionByNameOrId(collection));
    challenge.id = $security.randomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789");
    challenge.set("email", input.email);
    challenge.set("purpose", input.purpose);
    if (user) challenge.set("user", user.id);
    challenge.set("code_hash", $security.sha256(challenge.id + ":" + code));
    challenge.set("requested_at", now);
    challenge.set("expires_at", now + 300000);
    challenge.set("request_ip", e.realIP());
    app.save(challenge);
  });

  // Respons sama untuk email yang tidak terdaftar; kode tidak pernah dikirim ke client.
  if (user) {
    try {
      const meta = e.app.settings().meta;
      e.app.newMailClient().send(new MailerMessage({
        from: {address: meta.senderAddress, name: meta.senderName},
        to: [{address: input.email}],
        subject: input.purpose === "registration"
          ? "Kode verifikasi Jadwalin" : "Kode pemulihan Jadwalin",
        text: "Kode Jadwalin: " + code + ". Berlaku 5 menit.",
        html: "<p>Kode Jadwalin: <strong>" + code + "</strong></p><p>Berlaku 5 menit.</p>",
      }));
    } catch (_) {
      fail(503, "mail_unavailable", "Kode belum berhasil dikirim.");
    }
  }
  return e.json(200, {challengeId: challenge.id,
    expiresAt: new Date(now + 300000).toISOString()});
};

exports.verifyCode = (e) => {
  const body = e.requestInfo().body;
  const input = identity(body);
  const code = String(body.code || "");
  if (!/^\d{6}$/.test(code)) fail(400, "otp_invalid", "Kode harus enam digit.");
  let user;
  let recovery;
  let failure;
  e.app.runInTransaction((app) => {
    const rows = app.findRecordsByFilter(collection,
      "id = {:id} && email = {:email} && purpose = {:purpose}", "", 1, 0,
      {id: String(body.challengeId || ""), ...input});
    if (!rows.length) { failure = "otp_invalid"; return; }
    const item = rows[0];
    if (item.getBool("consumed") || item.getBool("verified") ||
        item.getInt("expires_at") <= Date.now() || item.getInt("attempts") >= 5) {
      failure = "otp_expired"; return;
    }
    item.set("attempts", item.getInt("attempts") + 1);
    const valid = item.getString("code_hash") ===
      $security.sha256(item.id + ":" + code);
    if (!valid || !item.getString("user")) {
      app.save(item); failure = "otp_invalid"; return;
    }
    user = app.findRecordById("users", item.getString("user"));
    if (user.email().toLowerCase() !== input.email) {
      app.save(item); failure = "otp_invalid"; return;
    }
    item.set("verified", true);
    item.set("code_hash", "");
    if (input.purpose === "registration") {
      user.set("verified", true);
      app.save(user);
      item.set("consumed", true);
    } else {
      const grant = $security.randomString(64);
      const expires = Date.now() + 300000;
      item.set("grant_hash", $security.sha256(grant));
      item.set("grant_expires_at", expires);
      recovery = {challengeId: item.id, grant,
        expiresAt: new Date(expires).toISOString()};
    }
    app.save(item);
  });
  // Kesalahan dikeluarkan setelah commit agar jumlah percobaan tetap tersimpan.
  if (failure) fail(400, failure, "Kode salah atau sudah kedaluwarsa.");
  if (recovery) return e.json(200, recovery);
  return $apis.recordAuthResponse(e, user, "jadwalin_email_code");
};

exports.resetPassword = (e) => {
  const body = e.requestInfo().body;
  const password = String(body.password || "");
  const grant = String(body.grant || "");
  if (password.length < 8 || password !== body.passwordConfirm || grant.length !== 64) {
    fail(400, "invalid_input", "Password atau konfirmasi tidak valid.");
  }
  e.app.runInTransaction((app) => {
    const items = app.findRecordsByFilter(collection,
      "id = {:id} && purpose = 'passwordRecovery'", "", 1, 0,
      {id: String(body.challengeId || "")});
    if (!items.length) fail(400, "otp_expired", "Minta kode pemulihan baru.");
    const item = items[0];
    if (!item.getBool("verified") || item.getBool("consumed") ||
        item.getInt("grant_expires_at") <= Date.now() ||
        item.getString("grant_hash") !== $security.sha256(grant)) {
      fail(400, "otp_expired", "Minta kode pemulihan baru.");
    }
    const user = app.findRecordById("users", item.getString("user"));
    if (user.email().toLowerCase() !== item.getString("email")) {
      fail(400, "otp_expired", "Minta kode pemulihan baru.");
    }
    user.setPassword(password);
    user.refreshTokenKey();
    app.save(user);
    item.set("consumed", true);
    item.set("grant_hash", "");
    app.save(item);
  });
  return e.noContent(204);
};
