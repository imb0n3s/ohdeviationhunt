// node test/ext-bits.js — Bits receipt → Starchrom, once per transaction
const secret = Buffer.from("testsecret-testsecret-testsecret").toString("base64");
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-bits", EXT_SECRET: secret, BITS_ENABLED: "1" });
require("fs").rmSync("/tmp/dhtest-bits", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-bits", { recursive: true });
const crypto = require("crypto"), express = require("express"), assert = require("assert");
const ext = require("../extension"), game = require("../game");
const b64u = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const sign = (payload, key = secret) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ exp: Date.now() / 1000 + 300, ...payload })); return `${h}.${p}.${b64u(crypto.createHmac("sha256", Buffer.from(key, "base64")).update(`${h}.${p}`).digest())}`; };
const receipt = (tx, userId, sku, amount) => sign({ topic: "bits_transaction_receipt", data: { transactionId: tx, time: new Date().toISOString(), userId, product: { domainId: "x", sku, displayName: sku, cost: { amount, type: "bits" } } } });
(async () => {
  const app = express(); ext.mount(app); const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const post = async (tok, body) => { const r = await fetch(base + "/ext/bits/complete", { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
  game.loadPlayer("A", "alice", "Alice");
  const start = game.loadPlayer("A").starchrom;
  const tA = sign({ user_id: "A", channel_id: "1", role: "viewer" });
  let [s, j] = await post(tA, { receipt: receipt("tx1", "A", "starchrom25", 5) });
  assert.equal(s, 200); assert.equal(j.credited, true); assert.equal(j.player.starchrom, start + 25);
  [s, j] = await post(tA, { receipt: receipt("tx1", "A", "starchrom25", 5) });
  assert.equal(j.credited, false); assert.equal(j.player.starchrom, start + 25); console.log("duplicate receipt not credited twice");
  [s, j] = await post(tA, { receipt: receipt("tx2", "A", "starchrom125", 25) }); assert.equal(j.player.starchrom, start + 150);
  [s, j] = await post(tA, { receipt: receipt("tx3", "B", "starchrom25", 5) }); assert.equal(j.error, "wrong_user");
  [s, j] = await post(tA, { receipt: receipt("tx4", "A", "starchrom25", 1) }); assert.equal(j.error, "unknown_product");
  [s, j] = await post(tA, { receipt: sign({ topic: "bits_transaction_receipt", data: { transactionId: "tx5", userId: "A", product: { sku: "starchrom100", cost: { amount: 5 } } } }, Buffer.from("forged-forged-forged-forged-forg").toString("base64")) });
  assert.equal(s, 401); console.log("forged receipt rejected");
  [s, j] = await post(tA, { receipt: receipt("tx6", "A", "pods5", 50) });
  assert.equal(j.credited, true); assert.equal(j.player.unitCap, 255); console.log("capacity block: cap 250 → 255");
  console.log("all bits checks passed"); srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
