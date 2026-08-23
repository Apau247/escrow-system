const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/escrow.db", { readOnly: true });
console.log("audit rows:", JSON.stringify(db.prepare("SELECT COUNT(*) AS n FROM audit_logs").get()));
for (const s of db.prepare("SELECT seq,key,status FROM timeline_stages ORDER BY seq").all())
  console.log(`stage ${s.seq} ${s.key}: ${s.status}`);
console.log("obligations:", JSON.stringify(db.prepare("SELECT id,status FROM obligations").all()));
console.log("approvals:", JSON.stringify(db.prepare("SELECT * FROM approvals").all()));
