const secret = Buffer.from("testsecret-testsecret-testsecret").toString("base64");
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest2", EXT_SECRET: secret });

const crypto = require("crypto"), express = require("express");
const ext = require("../extension"), db = require("../db"), game = require("../game"), data = require("../data");
const b64u = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (payload) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ exp: Date.now() / 1000 + 300, ...payload })); return `${h}.${p}.${b64u(crypto.createHmac("sha256", Buffer.from(secret, "base64")).update(`${h}.${p}`).digest())}`; };
(async () => {
  await data.refresh?.();
  const app = express(); ext.mount(app); const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, tok, body) => { const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json", Origin: "https://abc.ext-twitch.tv" }, body: body && JSON.stringify(body) }); return [r.status, await r.json()]; };
  const t = jwt({ user_id: "111", channel_id: "1", role: "viewer" });
  console.log("no player:", (await call("/ext/shop/buy", t, { item: "unit", qty: 1 }))[1].error);
  const p = game.loadPlayer("111", "tester", "Tester"); p.starchrom = 1600; game.savePlayer(p);
  const [s0, bag] = await call("/ext/bag", t); console.log("bag:", s0, bag.player, bag.shop.map((i) => i.id));
  console.log("buy 3:", ...(await call("/ext/shop/buy", t, { item: "unit", qty: 3 })));
  console.log("buy 1 more (broke):", ...(await call("/ext/shop/buy", t, { item: "unit", qty: 1 })));
  console.log("bad qty:", (await call("/ext/shop/buy", t, { item: "unit", qty: -5 }))[1].error, "| bad item:", (await call("/ext/shop/buy", t, { item: "x", qty: 1 }))[1].error);
  console.log("no identity:", ...(await call("/ext/shop/buy", jwt({ opaque_user_id: "U1", channel_id: "1", role: "viewer" }), { item: "unit", qty: 1 })));
  console.log("forged:", (await call("/ext/shop/buy", t.slice(0, -3) + "abc", { item: "unit", qty: 1 }))[0]);
  srv.close(); process.exit(0);
})();
