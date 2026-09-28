// node test/unit-notices.js — hourly free-unit chat notices
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest5" });
require("fs").rmSync("/tmp/dhtest5", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest5");
const assert = require("assert"), db = require("../db"), game = require("../game");
const H = 3600e3, now = Date.now();
db.addChannel({ broadcaster_id: "CH", login: "imbon3s", display_name: "imbon3s", joined_via: "test" });
db.addChannel({ broadcaster_id: "OFF", login: "other", display_name: "other", joined_via: "test" });
const mk = (id, name, { lastUnitAgo, activeAgo, ch = "CH", units = 0 }) => {
  const p = game.loadPlayer(id, name.toLowerCase(), name); p.units.standard = units; game.savePlayer(p);
  db.q.savePlayer.run({ user_id: id, starchrom: p.starchrom, units: JSON.stringify(p.units), last_daily: 0, attempts: 0, last_unit_at: now - lastUnitAgo });
  db.q.touchActive.run(ch, now - activeAgo, id);
};
mk("1", "Luna", { lastUnitAgo: H + 60e3, activeAgo: 5 * 60e3 });           // playing, due      -> notice
mk("2", "Bob", { lastUnitAgo: H + 5e3, activeAgo: 30 * 60e3, units: 2 });  // playing, due      -> notice
mk("3", "Idle", { lastUnitAgo: 3 * H, activeAgo: 5 * H });                  // stopped playing   -> silent
mk("4", "Early", { lastUnitAgo: 20 * 60e3, activeAgo: 60e3 });              // not due yet       -> silent
mk("5", "Away", { lastUnitAgo: 2 * H, activeAgo: 60e3, ch: "OFF" });        // channel offline   -> silent
mk("6", "Back", { lastUnitAgo: 2 * H + 60e3, activeAgo: 60e3 });            // owed 2            -> "2 units"
const live = (id) => id === "CH";
const first = game.unitNotices(live, now);
console.log(first);
assert.deepEqual(first.map((x) => x[0]), ["CH", "CH"]);
assert.equal(first[0][1], "🎁 @Luna, @Bob acquired a Securement Unit!");
assert.equal(first[1][1], "🎁 @Back acquired 2 Securement Units!");
assert.equal(game.loadPlayer("2", "bob", "Bob").units.standard, 3);
assert.equal(game.unitNotices(live, now).length, 0);                        // already paid: no repeat
assert.equal(game.loadPlayer("3", "idle", "Idle").units.standard, 3);        // idle player still got units, silently
console.log("unit notice checks passed");
