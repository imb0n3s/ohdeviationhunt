// node test/audit.js — nightly audit: missing subs re-subscribed, revoked/refused channels removed
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-audit" });
require("fs").rmSync("/tmp/dhtest-audit", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-audit");
const assert = require("assert");
const db = require("../db"), twitch = require("../twitch");
const { Conduit } = require("../eventsub");
(async () => {
  db.saveBotAccount({ user_id: "BOT", login: "bot", access_token: "x", refresh_token: "x", expires_at: Date.now() + 1e9 });
  for (const [id, login] of [["A", "alive"], ["B", "gone"], ["C", "revoked"], ["D", "lost"]]) db.addChannel({ broadcaster_id: id, login, display_name: login, joined_via: "test" });
  const subs = [{ id: "sA", status: "enabled", condition: { broadcaster_user_id: "A" } }, { id: "sC", status: "moderator_removed", condition: { broadcaster_user_id: "C" } }];
  twitch.helix = async (m, path, { query, body } = {}) => {
    if (m === "GET") return { data: subs, pagination: {} };
    if (m === "DELETE") return null;
    if (m === "POST") { const b = body.condition.broadcaster_user_id; if (b === "B") { const e = new Error("x"); e.status = 403; throw e; } return { data: [{ id: "s" + b }] }; }
  };
  const pool = new Conduit(); pool.conduitId = "c";
  pool.onRemoved = (id, why) => db.removeChannel(id, `removed on Twitch (${why})`);
  const r = await pool.audit();
  assert.deepEqual(r.resubscribed, ["lost"]);
  assert.deepEqual(r.removed.sort(), ["gone", "revoked"]);
  assert.deepEqual(db.listEnabledChannels().map((c) => c.login).sort(), ["alive", "lost"]);
  console.log("nightly audit ✓", JSON.stringify(r));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
