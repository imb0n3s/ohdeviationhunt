// node test/pool.js — Legendary pool: !donate up to 750 each; at 10,000 every donor who threw catches it 100%;
// not filled in time -> donations still spent, no refunds (B 2026-10-08)
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-pool" });
require("fs").rmSync("/tmp/dhtest-pool", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-pool");
const assert = require("assert");
(async () => {
  const data = require("../data"); await data.refresh(); await require("../traits").refresh();
  const db = require("../db"), game = require("../game"), { ECONOMY } = require("../rarity");
  db.addChannel({ broadcaster_id: "CH", login: "ch", display_name: "CH", joined_via: "test" });
  const sent = [];
  const sp = new game.Spawns(async (bid, t) => { sent.push(t); });
  const dev = data.all().find((d) => d.variants.some((v) => v.kind === "variation"));
  const variant = dev.variants.find((v) => v.kind === "variation");
  const sc = (id) => game.loadPlayer(id).starchrom;
  const give = (id, n) => { const p = game.loadPlayer(id, "u" + id, "U" + id); p.starchrom = n; p.units.standard = 5; game.savePlayer(p); };
  // --- normal spawn: pool closed
  await sp.spawn("CH", true, { dev, variant: null });
  give("1", 5000);
  assert.match(sp.donate("CH", "1", "u1", "U1", "100"), /only opens when a Legendary/);
  await sp.resolve("CH");
  // --- Legendary that fills: 14 donors × 750 = 10,500 > 10,000 (last one capped)
  await sp.spawn("CH", true, { dev, variant });
  for (let i = 1; i <= 14; i++) give(String(i), 5000);
  assert.match(sp.donate("CH", "1", "u1", "U1", "1000"), /\+750 Starchrom to the Legendary pool: 750 \/ 10,000/); // capped at 750
  assert.match(sp.donate("CH", "1", "u1", "U1", "5"), /already put the most/);
  for (let i = 2; i <= 13; i++) sp.donate("CH", String(i), "u" + i, "U" + i, "max");
  assert.equal(sp.poolTotal(sp.active.get("CH")), 9750);
  const r = sp.donate("CH", "14", "u14", "U14", "max");                       // only 250 left to the goal
  assert.match(r, /filled the pool/); assert.equal(sc("14"), 4750);
  assert.ok(sent.some((t) => /LEGENDARY POOL FILLED/.test(t)));
  for (let i = 1; i <= 14; i++) if (i !== 3) sp.attempt("CH", String(i), "u" + i, "U" + i);   // #3 donated but never threw
  give("99", 500); sp.attempt("CH", "99", "u99", "U99");                                    // threw, didn't donate: normal odds
  await sp.resolve("CH");
  const res = sp.lastResult.get("CH");
  const won = new Set(res.winners.map((w) => w.name));
  for (let i = 1; i <= 14; i++) if (i !== 3) assert.ok(won.has("U" + i), "donor U" + i + " should have caught it");
  assert.ok(!won.has("U3"));
  assert.equal(sc("3"), 5000 - 750);                                       // spent, not refunded
  console.log("pool filled: every donor who threw caught it ✓ (" + won.size + " winners)");
  // --- Legendary that doesn't fill: no refund
  await sp.spawn("CH", true, { dev, variant });
  give("50", 1000); sp.donate("CH", "50", "u50", "U50", "600"); assert.equal(sc("50"), 400);
  sp.attempt("CH", "50", "u50", "U50");
  await sp.resolve("CH");
  const got = sc("50") - 390;                                              // 1000 - 600 donated - 10 throw, never refunded
  assert.ok(got === 0 || got === require("../game").rewardFor({ dev, variant }), "balance " + sc("50"));
  assert.ok(sent.some((t) => /pool didn't fill \(600 \/ 10,000\)\./.test(t)));
  console.log("pool not filled: no refund ✓");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
