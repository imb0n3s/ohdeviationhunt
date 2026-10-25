// node test/nextspawn.js — owner "next spawn for everyone" (B 2026-10-24): each channel's next spawn once, then random again
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-next" });
require("fs").rmSync("/tmp/dhtest-next", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-next");
const assert = require("assert");
(async () => {
  const data = require("../data"); await data.refresh(); await require("../traits").refresh();
  const db = require("../db"), game = require("../game");
  for (const c of ["A", "B"]) db.addChannel({ broadcaster_id: c, login: c.toLowerCase(), display_name: c, joined_via: "test" });
  const sp = new game.Spawns(async () => {});
  const dev = data.all().find((d) => d.variants.some((v) => v.kind === "skin"));
  const skin = dev.variants.find((v) => v.kind === "skin");
  game.setForcedNext(dev.id, skin.name);
  for (const c of ["A", "B"]) {
    const { spawn } = await sp.spawn(c, true);
    assert.equal(spawn.dev.id, dev.id); assert.equal(spawn.variant.name, skin.name);
    await sp.resolve(c);
  }
  // used once per channel: the next spawn in A is random again (the forced one would need luck to repeat 20 times)
  let same = 0;
  for (let i = 0; i < 20; i++) { const { spawn } = await sp.spawn("A", true); if (spawn.dev.id === dev.id && spawn.variant?.name === skin.name) same++; await sp.resolve("A"); }
  assert.ok(same < 20);
  assert.equal(game.forcedNext().done.length, 2);
  game.setForcedNext(null); assert.equal(game.forcedNext(), null);
  assert.throws(() => game.setForcedNext(dev.id, "Not A Skin"));
  console.log("next spawn for everyone: once per channel ✓");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
