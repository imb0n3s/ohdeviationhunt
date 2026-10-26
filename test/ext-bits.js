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
  // Artisan's Touch: no gloves = 1,250 Starchrom; worn gloves = back to full
  let before = game.loadPlayer("A").starchrom;
  [s, j] = await post(tA, { receipt: receipt("tx7", "A", "artisan250", 250) });
  assert.equal(j.credited, true); assert.equal(j.repaired, null); assert.equal(j.player.starchrom, before + 1250); console.log("artisan without gloves → 1,250 Starchrom");
  const pl = game.loadPlayer("A"); pl.gloves = ["savior"]; pl.glove_left = 3; game.savePlayer(pl);
  before = game.loadPlayer("A").starchrom;
  [s, j] = await post(tA, { receipt: receipt("tx8", "A", "artisan250", 250) });
  assert.equal(j.repaired, "Savior Gloves"); assert.equal(j.player.gloveLeft, 30); assert.equal(j.player.gloveMax, 30); assert.equal(j.player.starchrom, before); console.log("artisan repairs Savior Gloves 3 → 30");
  [s, j] = await post(tA, { receipt: receipt("tx9", "A", "artisan250", 25) }); assert.equal(j.error, "unknown_product");
  before = game.loadPlayer("A").starchrom;
  [s, j] = await post(tA, { receipt: receipt("tx11", "A", "artisan250", 250) }); // gloves already full -> Starchrom instead
  assert.equal(j.repaired, null); assert.equal(j.player.starchrom, before + 1250); console.log("artisan on full gloves → 1,250 Starchrom");
  assert.ok(ext.bagFor("A").bitsPacks.find((x) => x.sku === "artisan250").icon.endsWith("/panel/artisan.png"));
  // no identity shared (opaque id only): the signed receipt names the buyer (Twitch review 2026-10-26)
  const tAnon = sign({ opaque_user_id: "UabcA", channel_id: "1", role: "viewer" });
  before = game.loadPlayer("A").starchrom;
  [s, j] = await post(tAnon, { receipt: receipt("tx12", "A", "starchrom25", 5) });
  assert.equal(j.credited, true); assert.equal(j.player.starchrom, before + 25); console.log("Bits without sharing identity → credited to the receipt's buyer");
  const shopRes = await (await fetch(base + "/ext/bitsshop", { headers: { Authorization: "Bearer " + tAnon } })).json();
  assert.ok(shopRes.bitsPacks.some((x) => x.sku === "artisan250")); console.log("Bits Shop list served before identity");
  const cmds = JSON.stringify(await (await fetch(base + "/ext/commands")).json());
  assert.ok(!/ohwikiguide|https?:|collection page|leaderboard link/i.test(cmds), cmds.match(/.{60}(ohwikiguide|https?:|collection page|leaderboard link).{20}/i)?.[0]); console.log("panel commands have no website links");
  // a viewer who never played: buying with Bits signs them up (name looked up on Twitch)
  require("../twitch").helix = async () => ({ data: [{ id: "Z", login: "newbie", display_name: "Newbie" }] });
  const tZ = sign({ user_id: "Z", channel_id: "1", role: "viewer" });
  [s, j] = await post(tZ, { receipt: receipt("tx10", "Z", "starchrom25", 5) });
  assert.equal(j.credited, true); assert.equal(j.player.login, "newbie"); console.log("first-time buyer signed up and credited");
  console.log("all bits checks passed"); srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
