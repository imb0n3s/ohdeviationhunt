// node test/ext-destroy.js — destroy-a-specimen endpoint
const secret = Buffer.from("testsecret-testsecret-testsecret").toString("base64");
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest3", EXT_SECRET: secret });
require("fs").mkdirSync("/tmp/dhtest3", { recursive: true });
const crypto = require("crypto"), express = require("express"), assert = require("assert");
const ext = require("../extension"), db = require("../db"), game = require("../game"), data = require("../data"), traits = require("../traits");
const b64u = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (payload) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ exp: Date.now() / 1000 + 300, ...payload })); return `${h}.${p}.${b64u(crypto.createHmac("sha256", Buffer.from(secret, "base64")).update(`${h}.${p}`).digest())}`; };
(async () => {
  await data.refresh?.(); await traits.refresh();
  const app = express(); ext.mount(app); const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const post = async (tok, body) => { const r = await fetch(base + "/ext/specimen/destroy", { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
  const catchOne = (uid, dev, variant = "") => {
    const had = db.q.getCatch.get(uid, dev, variant);
    db.q.addCatch.run(uid, dev, variant, variant ? "variation" : "base", Date.now(), "1");
    const sp = traits.rollSpecimen("Grumpy Bulb", variant, ["Violet Robe"], "combat");
    return db.q.addSpecimen.run({ user_id: uid, deviation: dev, variant, ...sp, caught_at: Date.now(), channel: "1" }).lastInsertRowid;
  };
  game.loadPlayer("A", "alice", "Alice"); game.loadPlayer("B", "bob", "Bob");
  const a1 = catchOne("A", "grumpybulb"), a2 = catchOne("A", "grumpybulb"), a3 = catchOne("A", "grumpybulb", "Violet Robe");
  const b1 = catchOne("B", "grumpybulb");
  const tA = jwt({ user_id: "A" }), tB = jwt({ user_id: "B" });

  let [s, j] = await post(tA, { id: a1 }); assert.equal(s, 200); assert.equal(j.gained, 500);
  const g = j.bag.deviations.find((d) => d.id === "grumpybulb");
  assert.equal(g.count, 2); assert.equal(g.specimens.length, 2); assert.equal(j.bag.player.starchrom, 700); assert.equal(j.units, 1); assert.equal(j.bag.player.units, 6);
  console.log("destroy ok → count 2, specimens", g.specimens.map((x) => `${x.skill}/${x.activity}${x.variant ? " " + x.variant : ""}`));
  [s, j] = await post(tB, { id: a2 }); assert.equal(j.error, "not_found"); console.log("someone else's:", j.error);
  [s, j] = await post(tB, { id: b1 }); assert.equal(j.error, "last_one"); console.log("Bob's only one:", j.error);
  [s, j] = await post(tA, { id: a3 }); assert.equal(s, 200);
  const g2 = j.bag.deviations.find((d) => d.id === "grumpybulb");
  assert.equal(g2.count, 1); assert.deepEqual(g2.variantsOwned, []); console.log("destroyed the variant → count 1, variants owned", g2.variantsOwned);
  [s, j] = await post(tA, { id: a2 }); assert.equal(j.error, "last_one"); console.log("Alice's last one:", j.error);
  [s, j] = await post(tA, { id: a1 }); assert.equal(j.error, "not_found"); console.log("already destroyed:", j.error);
  console.log("all destroy checks passed"); srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
