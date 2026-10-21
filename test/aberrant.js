// node test/aberrant.js — Rebecca's "Aberrant" trait belongs to the Aberrant Progeny variation (B 2026-10-21)
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-aberrant" });
require("fs").rmSync("/tmp/dhtest-aberrant", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-aberrant");
const assert = require("assert");
(async () => {
  const data = require("../data"), traits = require("../traits");
  await data.refresh(); await traits.refresh();
  const db = require("../db"), game = require("../game");
  const dev = data.all().find((d) => d.name === "Rebecca");
  const names = dev.variants.map((v) => v.name);
  // rolls: Aberrant Progeny always gets Aberrant; a normal Rebecca never does
  for (let i = 0; i < 300; i++) {
    assert.equal(traits.rollSpecimen("Rebecca", "Aberrant Progeny", names, dev.category).t1, "rebecca_aberrant");
    assert.notEqual(traits.rollSpecimen("Rebecca", "", names, dev.category).t1, "rebecca_aberrant");
  }
  game.loadPlayer("A", "alice", "Alice");
  const add = (variant, t1) => db.q.addSpecimen.run({ user_id: "A", deviation: dev.id, variant, power: 4, mood: 5, t1, t1_level: null, t2: null, t3: null, caught_at: Date.now(), channel: "1" }).lastInsertRowid;
  const base = add("", "rebecca_aberrant"), empty = add("Aberrant Progeny", null), plain = add("", null);
  game.backfillVariantTraits();
  const get = (id) => db.raw.prepare("SELECT variant, t1 FROM specimens WHERE id=?").get(id);
  assert.deepEqual(get(base), { variant: "Aberrant Progeny", t1: "rebecca_aberrant" });
  assert.deepEqual(get(empty), { variant: "Aberrant Progeny", t1: "rebecca_aberrant" });
  assert.deepEqual(get(plain), { variant: "", t1: null });
  console.log("Aberrant = Aberrant Progeny ✓ (rolls, old normal ones promoted, empty variant ones filled)");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
