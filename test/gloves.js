// node test/gloves.js — gloves wear out after their successful catches (B 2026-10-08: Savior 30, others by price)
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-gloves" });
require("fs").rmSync("/tmp/dhtest-gloves", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-gloves");
const assert = require("assert");
(async () => {
  const data = require("../data"); await data.refresh(); await require("../traits").refresh();
  const db = require("../db"), game = require("../game"), shop = require("../shop"), { GLOVES, ECONOMY } = require("../rarity");
  assert.deepEqual(GLOVES.map((g) => g.catches), [9, 22, 30]);
  assert.equal(ECONOMY.destroyValue, 300);
  db.addChannel({ broadcaster_id: "CH", login: "ch", display_name: "CH", joined_via: "test" });
  const sent = [];
  const sp = new game.Spawns(async (bid, t) => { sent.push(t); });
  const dev = data.all()[0];
  let p = game.loadPlayer("G", "g", "G"); p.starchrom = 100000; p.units.standard = 50; game.savePlayer(p);
  p = game.loadPlayer("G"); assert.ok(shop.purchase(p, "rustic", 1).ok); game.savePlayer(p);
  assert.equal(game.loadPlayer("G").glove_left, 9);
  const rnd = Math.random;
  const round = async (hit) => { await sp.spawn("CH", true, { dev, variant: null }); const r = sp.attempt("CH", "G", "g", "G"); Math.random = () => (hit ? 0 : 0.999); await sp.resolve("CH"); Math.random = rnd; return r; };
  assert.match(await round(true), /Rustic Gloves \+3% \(9 catches left\)/);
  assert.equal(game.loadPlayer("G").glove_left, 8);
  await round(false); assert.equal(game.loadPlayer("G").glove_left, 8);  // a miss doesn't count
  for (let i = 0; i < 7; i++) await round(true);
  assert.equal(game.loadPlayer("G").glove_left, 1);
  await round(true);
  assert.deepEqual(game.loadPlayer("G").gloves, []);
  assert.ok(/@G's Rustic Gloves wore out — !buy a new pair/.test(sent[sent.length - 1]), sent[sent.length - 1]);
  p = game.loadPlayer("G"); assert.ok(shop.purchase(p, "rustic", 1).ok, "can buy a new pair"); game.savePlayer(p);
  // pairs bought before gloves wore out start with a full count
  db.raw.prepare("UPDATE players SET gloves='[\"savior\"]', glove_left=-1 WHERE user_id='G'").run();
  assert.equal(game.loadPlayer("G").glove_left, 30);
  console.log("gloves wear out ✓ (9 / 22 / 30), scrap 300 ✓");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
