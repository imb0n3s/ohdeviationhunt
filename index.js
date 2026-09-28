// index.js — start the web site, the Twitch listener, live-status polling and the spawn loop
const cfg = require("./config");
const db = require("./db");
const twitch = require("./twitch");
const data = require("./data");
const { Conduit } = require("./eventsub");
const { makeHandler } = require("./commands");
const { Spawns } = require("./game");
const { createApp } = require("./web");

async function main() {
  await data.start();
  const traits = require("./traits");
  await traits.refresh();
  setInterval(traits.refresh, 6 * 60 * 60 * 1000).unref();

  const pool = new Conduit(null);
  pool.send = (bid, text, replyTo) => twitch.sendChat(bid, text, replyTo).catch((e) => console.error("[chat] send failed:", e.message));
  const spawns = new Spawns((bid, text) => pool.send(bid, text));
  pool.spawns = spawns;
  pool.onChat = makeHandler(pool, spawns);
  spawns.restore();

  // Which joined channels are live right now? Helix /streams takes up to 100 ids per call.
  let polling = false;
  pool.refreshLive = async () => {
    if (polling || !db.getBotAccount()) return;
    polling = true;
    try {
      const ids = db.listEnabledChannels().map((c) => c.broadcaster_id);
      const live = new Set();
      for (let i = 0; i < ids.length; i += 100) {
        const u = ids.slice(i, i + 100);
        const qs = u.map((id) => `user_id=${id}`).join("&");
        const r = await twitch.helix("GET", `/streams?first=100&${qs}`, { as: "app" });
        for (const s of r.data || []) live.add(s.user_id);
      }
      for (const id of ids) spawns.setLive(id, live.has(id));
      for (const id of [...spawns.live]) if (!ids.includes(id)) spawns.setLive(id, false);
    } catch (e) { console.error("[live] poll failed:", e.message); }
    finally { polling = false; }
  };

  const app = createApp(pool);
  app.listen(cfg.PORT, () => console.log(`[web] ${cfg.BOT_NAME} on ${cfg.BASE_URL} (port ${cfg.PORT})`));

  if (db.getBotAccount()) {
    await pool.joinAllFromDb().catch((e) => console.error("[eventsub] startup failed:", e.message));
  } else {
    console.log(`[setup] No bot account yet. Open ${cfg.BASE_URL}/setup?key=<ADMIN_KEY> and log in as the bot's Twitch account.`);
  }

  pool.refreshLive();
  setInterval(pool.refreshLive, cfg.LIVE_POLL_SECONDS * 1000).unref();
  setInterval(() => spawns.tick(), 15 * 1000).unref();
  // hourly free Securement Unit notices for people who are playing
  const { unitNotices } = require("./game");
  setInterval(() => {
    try {
      for (const [ch, msg] of unitNotices((id) => spawns.live.has(id))) pool.send(ch, msg);
    } catch (e) { console.error("[units] notice failed:", e.message); }
  }, 60 * 1000).unref();
}

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
main().catch((e) => { console.error(e); process.exit(1); });
