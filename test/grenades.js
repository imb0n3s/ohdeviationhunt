// node test/grenades.js — Binding Grenades (B 2026-10-10): every throw needs + uses one, levels add catch chance
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-gren" });
require("fs").rmSync("/tmp/dhtest-gren", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-gren");
const assert = require("assert");
(async () => {
  const data = require("../data"); await data.refresh(); await require("../traits").refresh();
  const db = require("../db"), game = require("../game"), shop = require("../shop");
  db.addChannel({ broadcaster_id: "CH", login: "ch", display_name: "CH", joined_via: "test" });
  const sp = new game.Spawns(async () => {});
  const dev = data.all()[0];
  let p = game.loadPlayer("A", "alice", "Alice");
  assert.equal(game.grenadeCount(p, 1), 15);                                       // everyone starts with 15 Lv.1
  p.starchrom = 10000; game.savePlayer(p);
  // plain !secure uses Lv.1 (the best she has)
  await sp.spawn("CH", true, { dev, variant: null });
  assert.match(sp.attempt("CH", "A", "alice", "Alice"), /Threw a Lv\.1 Binding Grenade .*14 Lv\.1 left/);
  assert.equal(sp.active.get("CH").attempts.get("A").bonus, 0);
  await sp.resolve("CH");
  // buy Lv.5 (2 packs = 10) on the shop: best grenade is used by default, +5% chance
  p = game.loadPlayer("A"); assert.ok(shop.purchase(p, "grenade5", 2).ok); game.savePlayer(p);
  assert.equal(game.grenadeCount(game.loadPlayer("A"), 5), 10);
  assert.match(game.buy("A", "alice", "Alice", ["grenade3"]), /bought 5 Lv\.3 Binding Grenades/);
  await sp.spawn("CH", true, { dev, variant: null });
  assert.match(sp.attempt("CH", "A", "alice", "Alice"), /Lv\.5 Binding Grenade \(\+5%\)/);
  assert.equal(sp.active.get("CH").attempts.get("A").bonus, 0.05);
  await sp.resolve("CH");
  // !secure 1 picks Lv.1; !secure 3 picks Lv.3 (+2.5%)
  await sp.spawn("CH", true, { dev, variant: null });
  assert.match(sp.attempt("CH", "A", "alice", "Alice", "3"), /Lv\.3 Binding Grenade \(\+2\.5%\)/);
  assert.equal(sp.active.get("CH").attempts.get("A").bonus, 0.025);
  await sp.resolve("CH");
  // out of grenades -> can't throw (nothing spent)
  p = game.loadPlayer("A"); p.grenades = {}; const sc = p.starchrom, u = p.units.standard; game.savePlayer(p);
  await sp.spawn("CH", true, { dev, variant: null });
  assert.match(sp.attempt("CH", "A", "alice", "Alice"), /out of Binding Grenades/);
  assert.equal(game.loadPlayer("A").starchrom, sc); assert.equal(game.loadPlayer("A").units.standard, u);
  await sp.resolve("CH");
  // grenades never reach the Twitch panel's shop
  assert.ok(!shop.catalog().some((i) => i.kind === "grenades"));
  assert.ok(shop.ITEMS.filter((i) => i.kind === "grenades").length === 3);
  assert.ok(game.shop().length <= 500);
  console.log("Binding Grenades ✓ (start 15, used per throw, levels +0/+2.5/+5%, !secure N, shop packs, not in panel)");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
