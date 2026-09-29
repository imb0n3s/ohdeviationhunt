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
  console.log("bits are off: no packs, receipts refused"); srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
