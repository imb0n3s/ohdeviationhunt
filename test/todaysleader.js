// node test/todaysleader.js — !todaysleader: most deviations secured in this channel during the current stream
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-tl" });
require("fs").rmSync("/tmp/dhtest-tl", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-tl");
const assert = require("assert");
(async () => {
  await require("../data").refresh();
  const db = require("../db"), game = require("../game");
  for (const [id, n] of [["A", "Alice"], ["B", "Bob"], ["C", "Cara"]]) game.loadPlayer(id, n.toLowerCase(), n);
  const start = Date.now() - 3600e3;
  const add = (uid, chan, at) => db.q.addSpecimen.run({ user_id: uid, deviation: "grumpybulb", variant: "", power: 3, mood: 3, t1: null, t1_level: null, t2: null, t3: null, caught_at: at, channel: chan });
  add("A", "CH", Date.now()); add("A", "CH", Date.now()); add("B", "CH", Date.now()); add("B", "CH", Date.now()); add("B", "CH", Date.now());
  add("C", "CH", start - 1000); add("C", "CH", start - 1000); add("C", "CH", start - 1000); add("C", "CH", start - 1000); // before this stream
  add("A", "OTHER", Date.now()); add("A", "OTHER", Date.now()); add("A", "OTHER", Date.now());                        // another channel
  const r = game.todaysLeader("CH", start, "Viewer");
  assert.match(r, /Today's leader: @Bob with 3 deviations/); assert.match(r, /🥈 Alice \(2\)/); assert.ok(!/Cara/.test(r), r);
  assert.match(game.todaysLeader("CH", null, "Viewer"), /isn't live/);
  assert.match(game.todaysLeader("EMPTY", start, "Viewer"), /nobody has secured/);
  console.log("!todaysleader ✓", r);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
