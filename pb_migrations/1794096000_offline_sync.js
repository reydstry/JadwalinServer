migrate((app) => {
  for (const name of ["jadwalin_sync_receipts", "jadwalin_sync_deleted"]) {
    app.save(new Collection({
      name, type: "base", listRule: null, viewRule: null, createRule: null,
      updateRule: null, deleteRule: null,
      fields: [
        {name: "owner", type: "text", required: true},
        {name: "entity", type: "text", required: true},
        {name: "operation", type: "text"},
        {name: "payload", type: "text", max: 20000},
        {name: "outcome", type: "text"},
      ],
      indexes: name === "jadwalin_sync_receipts"
        ? ["CREATE UNIQUE INDEX idx_sync_receipt ON jadwalin_sync_receipts (owner, operation)"]
        : ["CREATE UNIQUE INDEX idx_sync_deleted ON jadwalin_sync_deleted (entity)"],
    }));
  }
}, (app) => {
  app.delete(app.findCollectionByNameOrId("jadwalin_sync_receipts"));
  app.delete(app.findCollectionByNameOrId("jadwalin_sync_deleted"));
});
