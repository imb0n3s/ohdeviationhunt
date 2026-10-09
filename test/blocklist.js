// node test/blocklist.js — blocked accounts are wiped from the game and ignored (B 2026-10-09: auravella)
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-block" });
require("fs").rmSync("/tmp/dhtest-block", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-block");
const assert = require("assert");
(async () => {
  await require("../data").refresh();
  const db = require("../db"), game = require("../game");
  db.addChannel({ broadcaster_id: "AUR", login: "auravella", display_name: "Auravella", joined_via: "test" });
  db.addChannel({ broadcaster_id: "OK", login: "goodstreamer", display_name: "GoodStreamer", joined_via: "test" });
  game.loadPlayer("AUR", "auravella", "Auravella"); game.loadPlayer("P2", "someone", "Someone");
  const spec = (uid, chan) => db.q.addSpecimen.run({ user_id: uid, deviation: "grumpybulb", variant: "", power: 3, mood: 3, t1: null, t1_level: null, t2: null, t3: null, caught_at: Date.now(), channel: chan });
  db.q.addCatch.run("AUR", "grumpybulb", "", "base", Date.now(), "AUR"); spec("AUR", "AUR");
  db.q.addCatch.run("P2", "grumpybulb", "", "base", Date.now(), "AUR"); spec("P2", "AUR");
  db.logSpawn("AUR", "grumpybulb", "", 2, 2); db.setSetting("surprise:AUR", "on");
  const bl = require("../blocklist");
  bl.purge();
  const R = db.raw, n = (sql, ...a) => R.prepare(sql).get(...a).n;
  assert.equal(n(`SELECT COUNT(*) n FROM players WHERE user_id='AUR'`), 0);
  assert.equal(n(`SELECT COUNT(*) n FROM catches WHERE user_id='AUR'`), 0);
  assert.equal(n(`SELECT COUNT(*) n FROM specimens WHERE user_id='AUR'`), 0);
  assert.equal(n(`SELECT COUNT(*) n FROM channels WHERE broadcaster_id='AUR'`), 0);
  assert.equal(n(`SELECT COUNT(*) n FROM spawn_log WHERE broadcaster_id='AUR'`), 0);
  assert.equal(db.getSetting("surprise:AUR"), null);
  assert.equal(n(`SELECT COUNT(*) n FROM specimens WHERE user_id='P2' AND channel IS NULL`), 1);     // others keep their catch
  assert.equal(n(`SELECT COUNT(*) n FROM channels WHERE broadcaster_id='OK'`), 1);
  assert.ok(bl.isBlocked("AUR") && bl.isBlocked(null, "Auravella") && !bl.isBlocked("P2", "someone"));
  assert.ok(bl.ids().includes("AUR"));
  console.log("blocked account wiped and ignored ✓");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
