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
assert.deepEqual(n, [["CH", "🎁 Hourly gift (+1 Securement Unit, +15 Starchrom): @Luna now 7 units · 315 Starchrom | @Bob now 7 units · 315 Starchrom 🎁"]]);
const u1 = units("1");
const sc1 = game.loadPlayer("1").starchrom;
// pods full: the hour still pays 15 Starchrom, no unit
{ const p = game.loadPlayer("2"); p.extra_cap = -(game.unitCap(p) - game.podsUsed(p)); game.savePlayer(p);
  const sc = p.starchrom, u = p.units.standard; backdate("2", H + 60e3); play("1", "CH");
  n = game.unitNotices(); assert.match(n[0][1], /^🎁 @Bob acquired an hourly 15 Starchrom! \(Securement Pods full, so no unit\) You now have [\d,]+ Starchrom\. 🎁$/); assert.equal(n.length, 1);
  assert.equal(game.loadPlayer("2").starchrom, sc + 15); assert.equal(units("2"), u);
  const q = game.loadPlayer("2"); q.extra_cap = 0; game.savePlayer(q); }

// Luna moves to another stream: her perks belong to CH's stream, so nothing until she types !hourly in CH2 (B 2026-10-07)
backdate("1", 40 * 60e3); play("1", "CH2");
backdate("1", 21 * 60e3);
assert.equal(game.unitNotices().length, 0);
assert.equal(game.nextUnitIn(game.loadPlayer("1")), "once you type !hourly in the live stream you're watching");
assert.match(game.timerCheck("1", "luna", "Luna"), /isn't on in this stream — type !hourly here/);
assert.match(game.hourly("1", "luna", "Luna", "CH2"), /Hourly perks on for this stream/);   // switched over: fresh hour
backdate("1", H + 60e3);
n = game.unitNotices(); console.log(n);
assert.match(n[0][1], /^🎁 @Luna acquired an hourly Securement Unit and 15 Starchrom! You now have \d+ Securement Units and [\d,]+ Starchrom\. 🎁$/); assert.equal(n.length, 1); assert.equal(n[0][0], "CH2");
assert.equal(units("1"), u1 + 1); assert.equal(game.loadPlayer("1").starchrom, sc1 + 15);

// back in CH: her perks are on CH2's stream now, so CH pays nothing until !hourly there
play("1", "CH"); backdate("1", H + 60e3);
assert.equal(game.unitNotices().length, 0);
assert.match(game.hourly("1", "luna", "Luna", "CH"), /Hourly perks on for this stream/);
assert.match(game.hourly("1", "luna", "Luna", "CH"), /already on for this stream/);
backdate("1", H + 60e3);
n = game.unitNotices(); assert.deepEqual(n.map((x) => x[0]), ["CH"]); assert.equal(units("1"), u1 + 2);

// a new broadcast in the same channel needs !hourly again
streams = { CH: "s2", CH2: "t1" }; play("1", "CH"); backdate("1", H + 60e3);
assert.equal(game.unitNotices().length, 0);
streams = { CH: "s1", CH2: "t1" }; { const p = game.loadPlayer("1"); p.last_unit_at = Date.now(); game.savePlayer(p); }

// away for hours then back: no back-pay, fresh hour
play("2", "CH"); backdate("2", 5 * H); const u2 = units("2");
assert.equal(game.unitNotices().length, 0); assert.equal(units("2"), u2);
assert.match(game.nextUnitIn(game.loadPlayer("2")), /^(59|60)m$/);

// !daily: once a day (Central), only while live
assert.match(game.daily("1", "luna", "Luna", "CH2"), /already claimed today's !daily/);
assert.equal(game.nextUnitIn(game.loadPlayer("3")), "once you type !hourly in the live stream you're watching");
raw.prepare("UPDATE daily_claims SET at = at - 86400000").run();          // next day
assert.match(game.daily("1", "luna", "Luna", "CH2"), /Daily supply drop/);
streams = {};
assert.match(game.daily("2", "bob", "Bob", "CH"), /only works while the stream is live/);
console.log("hourly unit checks passed");

// !daily typed right as the stream went live (stream not recorded) -> self-heals within a minute
{ streams = { CH: "s9" }; db.q.touchActive.run("CH", Date.now(), null, "2");
  raw.prepare("UPDATE daily_claims SET at = ? WHERE user_id = '2'").run(Date.now());
  raw.prepare("UPDATE players SET hourly_stream = 's9' WHERE user_id = '2'").run();   // what !daily's startHourly records
  backdate("2", H + 60e3); const before = units("2");
  const n2 = game.unitNotices(); assert.deepEqual(n2.map((x) => x[0]), ["CH"]); assert.ok(units("2") >= before);
  console.log("self-heal check passed"); }

// !hourly (and !secure, which calls startHourly) switch hourly perks on without !daily (B 2026-10-07)
{ streams = { CH: "h1" };
  game.loadPlayer("4", "nina", "Nina"); play("4", "CH");
  assert.equal(game.hourlyStatus(game.loadPlayer("4")).state, "needs_daily");
  assert.match(game.hourly("4", "nina", "Nina", "CH"), /Hourly perks on for this stream/);
  assert.match(game.hourly("4", "nina", "Nina", "CH"), /already on for this stream — next free Securement Unit \+ 15 Starchrom in 60m/);
  assert.equal(game.hourlyStatus(game.loadPlayer("4")).state, "running");
  backdate("4", H + 60e3); const u4 = units("4");
  assert.deepEqual(game.unitNotices().map((x) => x[0]), ["CH"]); assert.equal(units("4"), u4 + 1);
  // !daily afterwards keeps the running clock
  const before = game.loadPlayer("4").last_unit_at; game.daily("4", "nina", "Nina", "CH");
  assert.equal(game.loadPlayer("4").last_unit_at, before);
  // !secure path: startHourly true once, then false
  game.loadPlayer("5", "omar", "Omar"); play("5", "CH");
  assert.equal(game.startHourly("5", "omar", "Omar", "CH"), true);
  assert.equal(game.startHourly("5", "omar", "Omar", "CH"), false);
  // not live -> nothing
  streams = {}; game.loadPlayer("6", "pia", "Pia");
  assert.equal(game.startHourly("6", "pia", "Pia", "CH"), false);
  assert.match(game.hourly("6", "pia", "Pia", "CH"), /only works while the stream is live/);
  // next day it has to be switched on again
  streams = { CH: "h2" };                                     // next broadcast: needs !hourly again
  assert.equal(game.hourlyStatus(game.loadPlayer("5")).state, "needs_daily");
  console.log("!hourly / !secure start checks passed"); }

// !hourlycheck lists everyone with a running timer in this channel
{ streams = { CH: "k1", CH2: "k2" };
  for (const [id, n, ch] of [["7", "Zed", "CH"], ["8", "Amy", "CH"], ["9", "Off", "CH2"]]) { game.loadPlayer(id, n.toLowerCase(), n); play(id, ch); game.startHourly(id, n.toLowerCase(), n, ch); }
  game.loadPlayer("10", "idle", "Idle"); play("10", "CH");    // in the channel, timer never started
  const m = game.hourlyCheck("CH"); console.log(m);
  assert.equal(m.length, 1); assert.match(m[0], /Amy \(60m\)/); assert.match(m[0], /Zed \(60m\)/);
  assert.ok(!/Off|Idle/.test(m[0]));
  streams = {}; assert.match(game.hourlyCheck("CH")[0], /only run while the stream is live/);
  console.log("!hourlycheck checks passed"); }

// !timercheck
{ streams = { CH: "k1" };
  assert.match(game.timerCheck("7", "zed", "Zed"), /next free Securement Unit \+ 15 Starchrom arrives in 60m/);
  assert.match(game.timerCheck("10", "idle", "Idle"), /isn't on in this stream — type !hourly here/);
  streams = {}; assert.match(game.timerCheck("7", "zed", "Zed"), /isn't on in this stream/);
  console.log("!timercheck checks passed"); }
