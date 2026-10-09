// node test/trait-dupes.js — a specimen never has the same trait twice (B 2026-10-08: crafting Eureka Moment is on slots 2 and 3)
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-dupes" });
require("fs").rmSync("/tmp/dhtest-dupes", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-dupes");
const assert = require("assert");
(async () => {
  const data = require("../data"); await data.refresh(); const traits = require("../traits"); await traits.refresh();
  const db = require("../db"), game = require("../game");
  let rolls = 0;
  for (const d of data.all()) for (let i = 0; i < 400; i++) {
    const sp = traits.rollSpecimen(d.name, "", d.variants.map((v) => v.name), d.category);
    const names = [traits.nameOf(1, sp.t1, d.category), traits.nameOf(2, sp.t2, d.category), traits.nameOf(3, sp.t3, d.category)].filter(Boolean);
    assert.equal(new Set(names).size, names.length, `${d.name}: ${names.join(" / ")}`); rolls++;
  }
  // an old specimen with Eureka Moment twice gets a new slot 3
  const d = data.all().find((x) => x.category === "crafting");
  db.q.addSpecimen.run({ user_id: "A", deviation: d.id, variant: "", power: 3, mood: 3, t1: null, t1_level: null, t2: "eureka_moment", t3: "eureka_moment", caught_at: Date.now(), channel: "1" });
  assert.equal(game.fixDuplicateTraits(), 1);
  const sp = db.q.specimensOf.all("A", d.id)[0];
  assert.ok(sp.t3 && traits.nameOf(3, sp.t3, "crafting") !== "Eureka Moment", sp.t3);
  assert.equal(game.fixDuplicateTraits(), 0);
  console.log(`no repeated traits in ${rolls} rolls ✓, old duplicates fixed ✓`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
