// commands.js — routes chat messages to the game
const cfg = require("./config");
const db = require("./db");
const game = require("./game");

const lastReply = new Map(); // `${bid}:${user}:${cmd}` -> ts, stops one viewer spamming the bot
const USER_CD = 5000;

function isModOrOwner(ev) {
  return ev.chatter_user_id === ev.broadcaster_user_id || (ev.badges || []).some((b) => b.set_id === "moderator" || b.set_id === "broadcaster");
}

const HELP = () => `🎯 ${cfg.BOT_NAME}: combat deviations breach containment while the stream is live — type !secure to catch them. !units · !shop · !buy <unit> <n> · !daily · !dex · !scrap · !dev <name> · !hunttop. Full guide: ${cfg.BASE_URL}`;

function makeHandler(pool, spawns) {
  const botId = () => db.getBotAccount()?.user_id;
  const botLogin = () => db.getBotAccount()?.login;

  return async function onChat(ev) {
    if (ev.chatter_user_id === botId()) return;
    if (ev.source_broadcaster_user_id && ev.source_broadcaster_user_id !== ev.broadcaster_user_id) return; // shared-chat echoes
    const bid = ev.broadcaster_user_id;
    spawns.noteChat(bid);

    const text = (ev.message?.text || "").trim();
    if (!text.startsWith("!")) return;
    const [rawCmd, ...args] = text.split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const uid = ev.chatter_user_id, login = ev.chatter_user_login, name = ev.chatter_user_name;
    const reply = (m) => m && pool.send(bid, m, ev.message_id);

    // ---- the bot's own channel: !join / !leave ----
    if (bid === botId() && (cmd === "!join" || cmd === "!leave")) {
      if (cmd === "!leave") {
        db.removeChannel(uid);
        await pool.leave(uid);
        return reply(`@${name} left your channel. Come back any time with !join.`);
      }
      try {
        db.addChannel({ broadcaster_id: uid, login, display_name: name, joined_via: "chat" });
        await pool.join(uid);
        pool.refreshLive?.();
        return reply(`@${name} joined your channel! Deviations will start breaching while you're live. Mods: !hunt help. Type !leave here to remove me.`);
      } catch (e) {
        db.removeChannel(uid);
        if (e.message === "NEEDS_PERMISSION") return reply(`@${name} I need permission first: type /mod ${botLogin()} in your chat and !join again, or add me in one click at ${cfg.BASE_URL}`);
        console.error("[join] failed:", e.message);
        return reply(`@${name} couldn't join right now, try again in a minute.`);
      }
    }

    const channel = db.getChannel(bid);
    if (!channel?.enabled && bid !== botId()) return;

    // ---- catching: always allowed, no cooldown (one throw per spawn is enforced in game.js) ----
    if (cmd === "!secure" || cmd === "!catch") return reply(spawns.attempt(bid, uid, login, name, args[0]));

    // ---- mods / broadcaster: !hunt ... ----
    if (cmd === "!hunt") {
      const sub = (args[0] || "").toLowerCase();
      const mod = isModOrOwner(ev);
      if (mod && sub === "spawn") {
        const r = await spawns.spawn(bid, true);
        if (r.error === "already") return reply("A deviation is already loose — secure it first!");
        return;
      }
      if (mod && sub === "interval") {
        const n = parseInt(args[1], 10);
        if (!(n >= 2 && n <= 120)) return reply("Usage: !hunt interval <minutes 2-120>");
        db.setSpawnInterval(bid, n);
        spawns.scheduleNext(bid);
        return reply(`Deviations will breach about every ${n} minutes while you're live.`);
      }
      if (mod && (sub === "off" || sub === "on")) {
        db.setSpawnsOn(bid, sub === "on");
        return reply(sub === "on" ? "Spawns are back on." : "Spawns paused. !hunt on to resume (commands still work).");
      }
      if (mod && sub === "leave" && bid !== botId()) {
        db.removeChannel(bid);
        await pool.leave(bid);
        return reply(`Bye! ${cfg.BOT_NAME} has left this channel. Re-add it any time at ${cfg.BASE_URL}`);
      }
      if (mod && sub === "status") {
        const st = spawns.status(bid);
        const ch = db.getChannel(bid);
        return reply(`Live: ${spawns.live.has(bid) ? "yes" : "no"} · spawns ${ch.spawns_on ? "on" : "off"} every ~${ch.interval_min || cfg.SPAWN_INTERVAL_MIN}m · ${st ? `${st.name} loose, ${st.secondsLeft}s left, ${st.attempts} throws` : "nothing loose"} · ${ch.spawns} spawns / ${ch.catches} catches here`);
      }
      if (mod && sub === "help") return reply("Mods: !hunt spawn (spawn now) · !hunt interval <min> · !hunt off / on · !hunt status · !hunt leave");
      return reply(HELP());
    }

    // ---- everything else: light per-user cooldown ----
    const GAME_CMDS = ["!units", "!inv", "!shop", "!buy", "!daily", "!dex", "!deviadex", "!scrap", "!dev", "!hunttop", "!leaderboard"];
    if (!GAME_CMDS.includes(cmd)) return;
    const key = `${bid}:${uid}:${cmd}`;
    if (!isModOrOwner(ev) && Date.now() - (lastReply.get(key) || 0) < USER_CD) return;
    lastReply.set(key, Date.now());

    switch (cmd) {
      case "!units": case "!inv": return reply(game.inventory(uid, login, name));
      case "!shop": return reply(game.shop());
      case "!buy": return reply(game.buy(uid, login, name, args));
      case "!daily": return reply(game.daily(uid, login, name));
      case "!dex": case "!deviadex": {
        if (args[0]) { // !dex someone
          const other = db.q.getPlayerByLogin.get(args[0].replace(/^@/, "").toLowerCase());
          if (!other) return reply(`@${name} I don't know ${args[0]} yet.`);
          return reply(game.dex(other.user_id, other.login, other.display, cfg.BASE_URL).replace(/^@\S+/, other.display + "'s"));
        }
        return reply(game.dex(uid, login, name, cfg.BASE_URL));
      }
      case "!scrap": return reply(game.scrap(uid, login, name));
      case "!dev": {
        if (!args.length) return reply(`@${name} usage: !dev <deviation name>`);
        return reply(game.info(args.join(" "), cfg.BASE_URL) || `@${name} no combat deviation matches "${args.join(" ")}".`);
      }
      case "!hunttop": case "!leaderboard": return reply(game.top(cfg.BASE_URL));
    }
  };
}

setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of lastReply) if (v < cutoff) lastReply.delete(k);
}, 10 * 60 * 1000).unref();

module.exports = { makeHandler, HELP };
