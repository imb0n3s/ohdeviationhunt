// node test/live-breaking.js — 24/7 ticker: Legendary caught on another stream -> BREAKING NEWS (B 2026-10-08)
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-live" });
require("fs").rmSync("/tmp/dhtest-live", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-live");
const assert = require("assert");
(async () => {
  const data = require("../data"); await data.refresh();
  const db = require("../db"), live = require("../live"), game = require("../game");
  db.addChannel({ broadcaster_id: "BOT", login: "ohdeviationhunt", display_name: "OHDeviationHunt", joined_via: "test" });
  db.addChannel({ broadcaster_id: "OTHER", login: "luna_raventhorn", display_name: "luna_raventhorn", joined_via: "test" });
  game.loadPlayer("P", "metaryder", "MetaRyder");
  const d = data.all().find((x) => x.variants.some((v) => v.kind === "variation")), v = d.variants.find((x) => x.kind === "variation");
  const add = (variant, chan, at) => db.q.addSpecimen.run({ user_id: "P", deviation: d.id, variant, power: 5, mood: 4, t1: null, t1_level: null, t2: null, t3: null, caught_at: at, channel: chan });
  add(v.name, "OTHER", Date.now());            // shows
  add("", "OTHER", Date.now());                 // normal catch: no
  add(v.name, "BOT", Date.now());               // caught on the 24/7 stream itself: no
  add(v.name, "OTHER", Date.now() - 10 * 60e3); // too old: no
  const ch = db.getChannelByLogin("ohdeviationhunt");
  const st = live.liveData({ spawns: null }, ch);
  assert.equal(st.breaking.length, 1);
  assert.deepEqual({ ...st.breaking[0], id: 0 }, { id: 0, who: "MetaRyder", name: d.name, variant: "Variation: " + v.name, rating: "5/4", chan: "luna_raventhorn", login: "luna_raventhorn" });
  if (process.argv[2] === "shot") {
    const express = require("express"); const app = express(); live.mount(app, { spawns: null });
    const srv = app.listen(0); const { chromium } = require(require.resolve("playwright", { paths: [__dirname + "/.."] }));
    const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto(`http://127.0.0.1:${srv.address().port}/live/ohdeviationhunt`); await p.waitForTimeout(3000);
    await p.screenshot({ path: process.argv[3], clip: { x: 0, y: 960, width: 1920, height: 120 } }); await b.close(); srv.close();
  }
  console.log("breaking news: only Legendaries from other streams in the last 3 minutes ✓");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
