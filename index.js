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
  // Start answering web requests right away (restarts on deploy are shorter), then load the
  // deviation + trait data from the wiki.
  const pool = new Conduit(null);
  const app = createApp(pool);
  app.listen(cfg.PORT, () => console.log(`[web] ${cfg.BOT_NAME} on ${cfg.BASE_URL} (port ${cfg.PORT})`));

  await data.start();
  const traits = require("./traits");
  await traits.refresh();
  const variantBackfill = () => { try { const n = require("./game").backfillVariantTraits(); if (n) console.log(`[traits] gave ${n} variant specimen(s) their variant trait`); const d = require("./game").fixDuplicateTraits(); if (d) console.log(`[traits] re-rolled slot 3 on ${d} specimen(s) that repeated a trait`); } catch (e) { console.error("[traits] backfill:", e.message); } };
  variantBackfill();
  setInterval(async () => { await traits.refresh(); variantBackfill(); }, 6 * 60 * 60 * 1000).unref();
  require("./wikisync").scheduleWikiSync(); // publish the player guide to ohwikiguide.com if it changed (needs WIKI_BOT_* env)

  // Chat sends go out one at a time per channel. Where the bot isn't a mod, Twitch allows ~1 message a second and
  // answers 429 "sending messages too quickly" (B 2026-10-09: a !secure reply got lost in OldManSauce's chat right after
  // the spawn message). After a 429 that channel is paced at 1.1s between messages, and the message is retried.
  const sendQ = new Map(), slow = new Set(), lastSent = new Map();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  pool.send = (bid, text, replyTo) => {
    const job = (sendQ.get(bid) || Promise.resolve()).then(async () => {
      for (let tries = 0; tries < 4; tries++) {
        if (slow.has(bid)) { const gap = 1100 - (Date.now() - (lastSent.get(bid) || 0)); if (gap > 0) await wait(gap); }
        try { const d = await twitch.sendChat(bid, text, replyTo); lastSent.set(bid, Date.now()); return d; }
        catch (e) {
          lastSent.set(bid, Date.now());
          if (/429/.test(e.message) && tries < 3) { if (!slow.has(bid)) console.warn(`[chat] ${bid} is rate limited (bot not a mod there?) — pacing messages`); slow.add(bid); await wait(1500); continue; }
          console.error("[chat] send failed:", e.message); return null;
        }
      }
    });
    sendQ.set(bid, job.catch(() => {}));
    return job;
  };
  const spawns = new Spawns((bid, text) => pool.send(bid, text));
  pool.spawns = spawns;
  pool.onChat = makeHandler(pool, spawns);
  spawns.restore();

  // The bot's own channel (OHDeviationHunt) is a game channel too, so its 24/7 stream (/live/<bot login>)
  // gets spawns. Set BOT_CHANNEL_GAME=0 to turn that off.
  const botAcct = db.getBotAccount();
  if (botAcct && process.env.BOT_CHANNEL_GAME !== "0" && !db.getChannel(botAcct.user_id)?.enabled) {
    db.addChannel({ broadcaster_id: botAcct.user_id, login: botAcct.login, display_name: botAcct.login === "ohdeviationhunt" ? "OHDeviationHunt" : botAcct.login, joined_via: "bot" });
    console.log(`[live] ${botAcct.login} added as a game channel (24/7 stream)`);
  }

  // Which joined channels are live right now? Helix /streams takes up to 100 ids per call.
  // returns the in-flight check if one is already running, so callers can wait for fresh status
  let polling = null;
  pool.refreshLive = () => {
    if (polling) return polling;
    if (!db.getBotAccount()) return Promise.resolve();
    polling = (async () => {
    try {
      const ids = db.listEnabledChannels().map((c) => c.broadcaster_id);
      const live = new Set(), streams = new Map(), info = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const u = ids.slice(i, i + 100);
        const qs = u.map((id) => `user_id=${id}`).join("&");
        const r = await twitch.helix("GET", `/streams?first=100&${qs}`, { as: "app" });
        for (const s of r.data || []) { live.add(s.user_id); streams.set(s.user_id, s.id); info.set(s.user_id, { title: s.title, game: s.game_name, viewers: s.viewer_count, startedAt: Date.parse(s.started_at) || null }); }
      }
      for (const id of ids) spawns.setLive(id, live.has(id));
      spawns.streamIds = streams;
      spawns.streamInfo = info;
      for (const id of [...spawns.live]) if (!ids.includes(id)) spawns.setLive(id, false);
    } catch (e) { console.error("[live] poll failed:", e.message); }
    finally { polling = null; }
    })();
    return polling;
  };


  // blocked accounts (blocklist.js): wipe them from the game before joining channels, then make sure the bot isn't in their chat
  const blocklist = require("./blocklist");
  try { blocklist.purge(); } catch (e) { console.error("[blocklist] purge failed:", e.message); }
  if (db.getBotAccount()) {
    await pool.joinAllFromDb().catch((e) => console.error("[eventsub] startup failed:", e.message));
    for (const id of blocklist.ids()) await pool.leave(id).catch(() => {});
  } else {
    console.log(`[setup] No bot account yet. Open ${cfg.BASE_URL}/setup?key=<ADMIN_KEY> and log in as the bot's Twitch account.`);
  }

  pool.refreshLive();
  setInterval(pool.refreshLive, cfg.LIVE_POLL_SECONDS * 1000).unref();
  setInterval(() => spawns.tick(), 15 * 1000).unref();
  // hourly free Securement Units (+ chat notice) for people who did !daily in a live stream
  const { unitNotices, setStreamLookup, refundAllMisses, setAnnouncer } = require("./game");
  setAnnouncer((ch, text) => pool.send(ch, text));
  try { const r = refundAllMisses("refund-misses:all-v1", { luna_raventhorn: 7 }); if (r) console.log("[refund] missed-throw units returned:", r.join(" ") || "none"); } catch (e) { console.error("[refund]", e.message); }
  setStreamLookup((ch) => (spawns.live.has(ch) && spawns.streamIds?.get(ch)) || null);
  // one-time make-good (B 2026-10-08): OldManSauce lost his hourly units to the stream-switch timer bug —
  // give him the missed hourly + one extra (2 Securement Units if his pods have room, +2 × hourly Starchrom)
  try {
    const key = "grant:oldmansauce:20261008";
    const row = !db.getSetting(key) && db.q.getPlayerByLogin.get("oldmansauce");
    if (row) {
      const game = require("./game"), { ECONOMY } = require("./rarity");
      const p = game.loadPlayer(row.user_id);
      const units = Math.min(2 * ECONOMY.hourlyUnits, game.unitRoom(p)), sc = 2 * ECONOMY.hourlyStarchrom;
      p.units.standard = (p.units.standard || 0) + units; p.starchrom += sc;
      game.savePlayer(p);
      db.setSetting(key, `units=${units} starchrom=${sc}`);
      console.log(`[grant] OldManSauce +${units} Securement Units +${sc} Starchrom`);
      setTimeout(() => {
        const ch = db.getBotAccount()?.user_id;
        if (ch) pool.send(ch, `🎁 @${p.display} here are 2 hourly rewards (+${units} Securement Unit${units === 1 ? "" : "s"} and +${sc} Starchrom) to make up for a timer bug that kept resetting your hourly clock — it's fixed now. Thanks for playing! 🎁`);
      }, 45000);
    }
  } catch (e) { console.error("[grant]", e.message); }
  setInterval(() => {
    try {
      for (const [ch, msg] of unitNotices()) pool.send(ch, msg);
    } catch (e) { console.error("[units] notice failed:", e.message); }
  }, 60 * 1000).unref();
}

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
main().catch((e) => { console.error(e); process.exit(1); });
