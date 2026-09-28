// node test/scrap.js — !scrap never touches variations or skins
Object.assign(process.env, { TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", ADMIN_KEY: "x", DATA_DIR: "/tmp/dhtest-scrap" });
require("fs").rmSync("/tmp/dhtest-scrap", { recursive: true, force: true }); require("fs").mkdirSync("/tmp/dhtest-scrap", { recursive: true });
const assert = require("assert"), game = require("../game"), db = require("../db"), traits = require("../traits");
(async () => {
  await traits.refresh();
  game.loadPlayer("A", "alice", "Alice");
  const add = (variant) => {
    const had = db.q.getCatch.get("A", "grumpybulb", variant);
    if (had) db.q.addCatch.run("A", "grumpybulb", variant, variant ? "variation" : "base", Date.now(), "1");
    else db.q.addCatch.run("A", "grumpybulb", variant, variant ? "variation" : "base", Date.now(), "1");
    db.q.addSpecimen.run({ user_id: "A", deviation: "grumpybulb", variant, ...traits.rollSpecimen("Grumpy Bulb", variant, ["Violet Robe"], "combat"), caught_at: Date.now(), channel: "1" });
  };
  add(""); add(""); add(""); add("Violet Robe"); add("Violet Robe");
  console.log(game.scrap("A", "alice", "Alice"));
  const specs = db.q.specimensOf.all("A", "grumpybulb");
  assert.equal(specs.filter((x) => !x.variant).length, 1);
  assert.equal(specs.filter((x) => x.variant === "Violet Robe").length, 2);
  console.log("scrap keeps every variation/skin");
})().catch((e) => { console.error(e); process.exit(1); });
