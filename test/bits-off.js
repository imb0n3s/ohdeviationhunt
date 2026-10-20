// node test/bits-off.js — with BITS_ENABLED unset, no packs are offered and receipts are refused
const secret = Buffer.from("testsecret-testsecret-testsecret").toString("base64");
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-bitsoff", EXT_SECRET: secret });
delete process.env.BITS_ENABLED;
require("fs").rmSync("/tmp/dhtest-bitsoff", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-bitsoff", { recursive: true });
const express = require("express"), assert = require("assert");
const ext = require("../extension"), game = require("../game");
(async () => {
  const app = express(); ext.mount(app); const srv = app.listen(0);
  game.loadPlayer("A", "a", "A");
  assert.deepEqual(ext.bagFor("A").bitsPacks, []);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}/ext/bits/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403); assert.equal((await r.json()).error, "bits_disabled");
  // owners (imbon3s) can test while it's off
  game.loadPlayer("O", "imbon3s", "imbon3s");
  assert.ok(ext.bagFor("O").bitsPacks.length > 0);
  assert.equal(require("../rarity").GLOVES[2].price, 10000);
  // review mode: everyone gets packs + credit, glove prices unchanged
  require("../bits").setReview(true);
  assert.ok(ext.bagFor("A").bitsPacks.length > 0); assert.equal(require("../rarity").GLOVES[2].price, 10000);
  require("../bits").setReview(false); assert.deepEqual(ext.bagFor("A").bitsPacks, []);
  // the live switch: on = packs for everyone + launch glove prices, no restart
  require("../bits").setLive(true);
  assert.ok(ext.bagFor("A").bitsPacks.length > 0);
  assert.deepEqual(require("../rarity").GLOVES.map((g) => [g.price, g.catches]), [[5000, 8], [10000, 17], [17500, 30]]);
  assert.equal(require("../shop").find("savior").price, 17500);
  require("../bits").setLive(false);
  assert.deepEqual(ext.bagFor("A").bitsPacks, []); assert.equal(require("../shop").find("savior").price, 10000);
  console.log("bits are off: no packs, receipts refused; owner can test; live switch works"); srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
