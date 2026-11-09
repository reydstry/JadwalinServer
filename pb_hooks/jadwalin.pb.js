routerAdd("POST", "/api/jadwalin/auth/request-code", (e) => {
  return require(__hooks + "/jadwalin_auth.js").requestCode(e);
}, $apis.bodyLimit(4096));

routerAdd("POST", "/api/jadwalin/auth/verify-code", (e) => {
  return require(__hooks + "/jadwalin_auth.js").verifyCode(e);
}, $apis.bodyLimit(4096));

routerAdd("POST", "/api/jadwalin/auth/reset-password", (e) => {
  return require(__hooks + "/jadwalin_auth.js").resetPassword(e);
}, $apis.bodyLimit(4096));

routerAdd("POST", "/api/jadwalin/schedules", (e) => {
  return require(__hooks + "/jadwalin_schedules.js").save(e, false);
}, $apis.requireAuth("users"), $apis.bodyLimit(8192));

routerAdd("PATCH", "/api/jadwalin/schedules/{id}", (e) => {
  return require(__hooks + "/jadwalin_schedules.js").save(e, true);
}, $apis.requireAuth("users"), $apis.bodyLimit(8192));

routerAdd("DELETE", "/api/jadwalin/schedules/{id}", (e) => {
  return require(__hooks + "/jadwalin_schedules.js").remove(e);
}, $apis.requireAuth("users"));

onRecordCreateRequest((e) => {
  return require(__hooks + "/jadwalin_schedules.js").validateRequest(e);
}, "jadwal");

onRecordUpdateRequest((e) => {
  return require(__hooks + "/jadwalin_schedules.js").validateRequest(e);
}, "jadwal");

cronAdd("jadwalin_email_code_cleanup", "*/15 * * * *", () => {
  const expired = $app.findRecordsByFilter("jadwalin_email_challenges",
    "expires_at < {:cutoff} && grant_expires_at < {:cutoff}", "", 200, 0,
    {cutoff: Date.now() - 86400000});
  for (const record of expired) $app.delete(record);
});

routerAdd("GET", "/api/jadwalin/sync", (e) => {
  return require(__hooks + "/jadwalin_sync.js").pull(e);
}, $apis.requireAuth("users"));
routerAdd("POST", "/api/jadwalin/sync", (e) => {
  return require(__hooks + "/jadwalin_sync.js").push(e);
}, $apis.requireAuth("users"), $apis.bodyLimit(16384));
// Model hook also covers old endpoints, collection APIs, and administrative deletes.
onRecordDelete((e) => {
  return require(__hooks + "/jadwalin_sync.js").deleted(e);
}, "jadwal");
