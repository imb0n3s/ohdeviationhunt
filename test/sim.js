// Simulated chat: runs the game with fake Twitch events, no network to Twitch.
process.env.TWITCH_CLIENT_ID ||= "x"; process.env.TWITCH_CLIENT_SECRET ||= "x"; process.env.ADMIN_KEY ||= "k";
process.env.DATA_DIR = require("path").join(__dirname, "..", "data-test");
require("fs").rmSync(process.env.DATA_DIR, { recursive: true, force: true });
process.env.SPAWN_WINDOW_SECONDS = "1";
const fs = require("fs");
const data = require("../data");
const db = require("../db");
const { Spawns } = require("../game");
const { makeHandler } = require("../commands");

(async () => {
  const raw = fs.readFileSync(process.argv[2] || require("path").join(__dirname, "..", "..", "dev_raw.txt"), "utf8");
  const devs = data.parse(raw);
  fs.writeFileSync(require("path").join(__dirname, "..", "combat-fallback.json"), JSON.stringify(devs, null, 1));
  await data.refresh().catch(() => {}); // wiki or snapshot
  await require("../traits").refresh();
  console.log("deviations:", data.all().length, data.info().source);
  const out = [];
  const pool = { send: async (b, t) => { out.push(t); console.log("BOT>", t); }, join: async () => {}, leave: async () => {} };
  db.saveBotAccount({ user_id: "999", login: "ohdeviationhunt", access_token: "a", refresh_token: "r", expires_at: 0 });
  db.addChannel({ broadcaster_id: "100", login: "imbon3s", display_name: "imbon3s", joined_via: "web" });
  const spawns = new Spawns(pool.send);
  const on = makeHandler(pool, spawns);
  const say = (uid, login, text, mod) => { console.log(`${login}> ${text}`); return on({ broadcaster_user_id: "100", chatter_user_id: uid, chatter_user_login: login, chatter_user_name: login, message: { text }, message_id: "m", badges: mod ? [{ set_id: "broadcaster" }] : [] }); };
  await say("100", "imbon3s", "!hunt");
  await say("100", "imbon3s", "!hunt spawn", true);
  await say("1", "viewer42", "!secure");
  await say("2", "metabones", "!secure elite");
  await say("2", "metabones", "!secure");   // duplicate throw ignored
  await say("3", "lurker", "!catch anomaly"); // no anomaly units
  await new Promise((r) => setTimeout(r, 1300));
  for (let i = 0; i < 30; i++) { await spawns.spawn("100"); await say("1", "viewer42", "!secure"); await say("2", "metabones", "!secure adv"); await spawns.resolve("100"); }
  await say("1", "viewer42", "!units");
  await say("1", "viewer42", "!daily");
  await say("1", "viewer42", "!daily");
  await say("1", "viewer42", "!shop");
  await say("1", "viewer42", "!buy 3 advanced");
  await say("1", "viewer42", "!dex");
  await say("5", "other", "!dex viewer42");
  await say("1", "viewer42", "!scrap");
  await say("1", "viewer42", "!dev teddy");
  await say("1", "viewer42", "!dev lonewolf");
  await say("1", "viewer42", "!hunttop");
  await say("1", "viewer42", "!traits");
  await say("2", "metabones", "!traits polar");
  await say("2", "metabones", "!traits behemoth");
  await say("100", "imbon3s", "!hunt interval 7", true);
  await say("100", "imbon3s", "!hunt status", true);
  const long = out.filter((m) => m.length > 500);
  console.log("\nmessages:", out.length, "over 500 chars:", long.length);
  // spawn distribution
  const { rollSpawn } = require("../game"); const c = {}; let v = 0;
  for (let i = 0; i < 20000; i++) { const s = rollSpawn(); c[s.dev.rarity] = (c[s.dev.rarity] || 0) + 1; if (s.variant) v++; }
  console.log("rarity dist", c, "variant rate", (v / 20000).toFixed(3));
  process.exit(long.length ? 1 : 0);
})();
