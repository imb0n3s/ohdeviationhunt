// node test/unit-notices.js — hourly free units: need today's !daily, earned in ONE live stream at a
// time (where you last played), and the timer carries over when you switch streams
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest5" });
require("fs").rmSync("/tmp/dhtest5", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest5");
const assert = require("assert"), db = require("../db"), game = require("../game");
const raw = new (require("better-sqlite3"))("/tmp/dhtest5/deviation-hunt.sqlite");
const H = 3600e3;
for (const ch of ["CH", "CH2"]) db.addChannel({ broadcaster_id: ch, login: ch.toLowerCase(), display_name: ch, joined_via: "test" });
let streams = { CH: "s1", CH2: "t1" };
game.setStreamLookup((ch) => streams[ch] || null);
const play = (id, ch) => db.q.touchActive.run(ch, Date.now(), streams[ch] || null, id);  // what any game command does
const units = (id) => game.loadPlayer(id).units.standard;
const backdate = (id, ms) => { const p = game.loadPlayer(id); p.last_unit_at -= ms; game.savePlayer(p); };
for (const [id, name] of [["1", "Luna"], ["2", "Bob"], ["3", "NoDaily"]]) game.loadPlayer(id, name.toLowerCase(), name);

console.log(game.daily("1", "luna", "Luna", "CH")); play("1", "CH");
game.daily("2", "bob", "Bob", "CH"); play("2", "CH");
play("3", "CH"); backdate("3", 3 * H);                   // playing but no !daily today -> nothing
assert.equal(game.unitNotices().length, 0);               // under an hour
backdate("1", H + 60e3); backdate("2", H + 60e3);
let n = game.unitNotices(); console.log(n);
assert.deepEqual(n, [["CH", "🎁 @Luna, @Bob acquired a Securement Unit!"]]);
const u1 = units("1");

// Luna moves to another stream 40 min into her next hour: the timer keeps running, notice goes there
backdate("1", 40 * 60e3); play("1", "CH2");
assert.equal(game.unitNotices().length, 0);
backdate("1", 21 * 60e3);
n = game.unitNotices(); console.log(n);
assert.deepEqual(n, [["CH2", "🎁 @Luna acquired a Securement Unit!"]]);   // one unit, in ONE stream only
assert.equal(units("1"), u1 + 1);

// "watching" two streams: whichever she played in last is the only one that counts
play("1", "CH"); backdate("1", H + 60e3);
n = game.unitNotices(); assert.deepEqual(n.map((x) => x[0]), ["CH"]); assert.equal(units("1"), u1 + 2);

// that stream ends -> paused; the next stream counts once she plays there
streams = { CH2: "t1" }; backdate("1", H + 60e3);
assert.equal(game.unitNotices().length, 0);
assert.equal(game.nextUnitIn(game.loadPlayer("1")), "in a live stream");
play("1", "CH2"); n = game.unitNotices(); assert.deepEqual(n.map((x) => x[0]), ["CH2"]);

// away for hours then back: no back-pay, fresh hour
play("2", "CH2"); backdate("2", 5 * H); const u2 = units("2");
assert.equal(game.unitNotices().length, 0); assert.equal(units("2"), u2);
assert.match(game.nextUnitIn(game.loadPlayer("2")), /^(59|60)m$/);

// !daily: once a day (Central), only while live
assert.match(game.daily("1", "luna", "Luna", "CH2"), /already claimed today's !daily/);
assert.equal(game.nextUnitIn(game.loadPlayer("3")), "after !daily");
raw.prepare("UPDATE daily_claims SET at = at - 86400000").run();          // next day
assert.equal(game.nextUnitIn(game.loadPlayer("1")), "after !daily");       // new day needs a new !daily
assert.match(game.daily("1", "luna", "Luna", "CH2"), /Daily supply drop/);
streams = {};
assert.match(game.daily("2", "bob", "Bob", "CH"), /only works while the stream is live/);
console.log("hourly unit checks passed");
