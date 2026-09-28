// node test/web-shop.js — shopping from your own collection page
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "adminkey", DATA_DIR: "/tmp/dhtest-webshop", BASE_URL: "http://127.0.0.1" });
require("fs").rmSync("/tmp/dhtest-webshop", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-webshop", { recursive: true });
const crypto = require("crypto"), assert = require("assert");
const web = require("../web"), game = require("../game"), data = require("../data");
const sign = (d) => { const b = Buffer.from(JSON.stringify(d)).toString("base64url"); return `${b}.${crypto.createHmac("sha256", "adminkey").update(b).digest("base64url")}`; };
(async () => {
  await data.refresh?.();
  const app = web.createApp({ spawns: { live: new Set(), streamInfo: new Map(), active: new Map() }, channelCount: 0 });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  game.loadPlayer("A", "alice", "Alice"); const p = game.loadPlayer("A"); p.starchrom = 5000; game.savePlayer(p);
  game.loadPlayer("B", "bob", "Bob");
  const sess = (uid, login) => "dh_user=" + sign({ purpose: "session", uid, login, exp: Date.now() + 1e6, ts: Date.now() });
  const buy = (cookie, body, login = "alice") => fetch(`${base}/u/${login}/buy`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", ...(cookie ? { Cookie: cookie } : {}) }, body: new URLSearchParams(body) });
  let r = await buy(null, { item: "unit", qty: "2" }); assert.match(r.headers.get("location"), /shop=signin/); console.log("signed out → sign in first");
  r = await buy(sess("B", "bob"), { item: "unit", qty: "2" }); assert.match(r.headers.get("location"), /shop=signin/); console.log("someone else → refused");
  r = await buy(sess("A", "alice"), { item: "unit", qty: "2" }); assert.match(r.headers.get("location"), /shop=ok%3Aunit%3A2/);
  assert.equal(game.loadPlayer("A").starchrom, 4000); console.log("owner bought 2 units");
  r = await buy(sess("A", "alice"), { item: "saviorgloves" }); assert.equal(game.loadPlayer("A").starchrom, 1000);
  r = await buy(sess("A", "alice"), { item: "bbqgloves" }); assert.match(r.headers.get("location"), /outclassed/);
  r = await fetch(`${base}/u/alice/buy`, { method: "POST", redirect: "manual", headers: { Origin: "https://evil.example", Cookie: sess("A", "alice"), "Content-Type": "application/x-www-form-urlencoded" }, body: "item=unit&qty=1" });
  assert.equal(r.status, 403); console.log("cross-site post blocked");
  let html = await (await fetch(`${base}/u/alice?shop=ok:saviorgloves:1`, { headers: { Cookie: sess("A", "alice") } })).text();
  assert.ok(html.includes("Bought Savior Gloves!") && html.includes("✓ Owned · active"));
  html = await (await fetch(`${base}/u/alice`)).text(); assert.ok(html.includes("Sign in with Twitch") && !html.includes('name="item"'));
  html = await (await fetch(`${base}/u/alice`, { headers: { Cookie: sess("B", "bob") } })).text(); assert.ok(!html.includes('name="item"'));
  require("fs").writeFileSync("/tmp/webshop.html", (await (await fetch(`${base}/u/alice`, { headers: { Cookie: sess("A", "alice") } })).text()));
  console.log("all web shop checks passed"); srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
