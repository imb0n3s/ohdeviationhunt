// node test/unit-cap.js — players can hold at most ECONOMY.unitCap Securement Units
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-cap" });
require("fs").rmSync("/tmp/dhtest-cap", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-cap", { recursive: true });
const assert = require("assert"), game = require("../game"), shop = require("../shop"), { ECONOMY } = require("../rarity");
const set = (units, sc = 1e6) => { const p = game.loadPlayer("A"); p.units.standard = units; p.starchrom = sc; game.savePlayer(p); };
game.loadPlayer("A", "alice", "Alice");
assert.equal(ECONOMY.unitCap, 100);
set(98); let p = game.loadPlayer("A");
assert.equal(shop.purchase(p, "unit", 3).error, "too_many");
assert.equal(shop.purchase(p, "unit", 2).ok, true); assert.equal(p.units.standard, 100);
assert.equal(shop.purchase(p, "unit", 1).error, "full");
set(100); console.log(game.buy("A", "alice", "Alice", ["1"]));
set(97); console.log(game.buy("A", "alice", "Alice", ["5"]));
set(99); console.log(game.buy("A", "alice", "Alice", ["1"]));
p = game.loadPlayer("A"); p.extra_cap = 50; assert.equal(game.unitRoom(p), 50); console.log("extra capacity works");
console.log("unit cap checks passed");
