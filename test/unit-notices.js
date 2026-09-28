// node test/unit-notices.js — hourly free units only after !daily in the current live stream
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest5" });
require("fs").rmSync("/tmp/dhtest5", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest5");
const assert = require("assert"), db = require("../db"), game = require("../game");
const H = 3600e3;
db.addChannel({ broadcaster_id: "CH", login: "imbon3s", display_name: "imbon3s", joined_via: "test" });
let streams = { CH: "stream-1" };                       // CH is live with stream id stream-1
game.setStreamLookup((ch) => streams[ch] || null);
const units = (id) => game.loadPlayer(id).units.standard;
const backdate = (id, ms) => { const p = game.loadPlayer(id); p.last_unit_at -= ms; game.savePlayer(p); };

for (const [id, name] of [["1", "Luna"], ["2", "Bob"], ["3", "NoDaily"]]) game.loadPlayer(id, name.toLowerCase(), name);
console.log(game.daily("1", "luna", "Luna", "CH"));
game.daily("2", "bob", "Bob", "CH");
const start = { 1: units("1"), 2: units("2"), 3: units("3") };
backdate("3", 3 * H);                                     // no !daily -> never gets hourly units

assert.equal(game.unitNotices().length, 0);               // under an hour: nothing yet
backdate("1", H + 60e3); backdate("2", H + 60e3);
let n = game.unitNotices(); console.log(n);
assert.deepEqual(n, [["CH", "🎁 @Luna, @Bob acquired a Securement Unit!"]]);
assert.equal(units("1"), start[1] + 1); assert.equal(units("3"), start[3]);
assert.equal(game.unitNotices().length, 0);               // no double pay in the same hour
assert.match(game.nextUnitIn(game.loadPlayer("1", "luna", "Luna")), /^\d+m$/);
assert.equal(game.nextUnitIn(game.loadPlayer("3")), "after !daily");

streams = {};                                            // stream ends
backdate("1", H + 60e3);
assert.equal(game.unitNotices().length, 0); assert.equal(units("1"), start[1] + 1);
streams = { CH: "stream-2", CH2: "other-1" };           // new stream: no 20h wait, !daily works again
db.addChannel({ broadcaster_id: "CH2", login: "other", display_name: "other", joined_via: "test" });
assert.equal(game.unitNotices().length, 0);               // hourly didn't carry over without a new !daily
let m = game.daily("1", "luna", "Luna", "CH"); console.log(m); assert.match(m, /Daily supply drop/);
m = game.daily("1", "luna", "Luna", "CH"); console.log(m); assert.match(m, /already claimed/);
m = game.daily("1", "luna", "Luna", "CH2"); console.log(m); assert.match(m, /moved here/);   // other stream
backdate("1", H + 60e3);
n = game.unitNotices(); console.log(n);
assert.deepEqual(n.map((x) => x[0]), ["CH2"]);            // only earns in ONE stream (the latest)
assert.equal(game.unitNotices().length, 0);
streams = {};
m = game.daily("2", "bob", "Bob", "CH"); console.log(m); assert.match(m, /only works while the stream is live/);
console.log("hourly unit checks passed");
