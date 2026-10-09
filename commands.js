// commands.js — routes chat messages to the game
const cfg = require("./config");
const db = require("./db");
const game = require("./game");

const lastReply = new Map(); // `${bid}:${user}:${cmd}` -> ts, stops one viewer spamming the bot
const USER_CD = 5000;

function isModOrOwner(ev) {
  return ev.chatter_user_id === ev.broadcaster_user_id || (ev.badges || []).some((b) => b.set_id === "broadcaster" || /moderator/.test(b.set_id || ""));
}

const HELP = () => `🎯 ${cfg.BOT_NAME}: deviations appear in the wild while the stream is live — type !secure to catch them (Legendary? !donate to the pool). !daily · !hourly · !timercheck · !starchrom · !units · !shop · !buy <n> · !pods · !traits <name> · !dev <name> · !hunttop · !todaysleader. Full guide: ${cfg.BASE_URL}`;

function makeHandler(pool, spawns) {
  const botId = () => db.getBotAccount()?.user_id;
  const botLogin = () => db.getBotAccount()?.login;

  return async function onChat(ev) {
    // ignore the bot's own posts — but if someone types a !command while logged in as the bot account, run it
    // (the bot itself never posts a message starting with "!")
    if (ev.chatter_user_id === botId() && !(ev.message?.text || "").trim().startsWith("!")) return;
    // Shared Chat: a message typed in a partner's chat reaches us as an echo. If the partner channel runs the game
    // itself, it handles the message there (skip, or it would count twice); otherwise we play it here.
    if (ev.source_broadcaster_user_id && ev.source_broadcaster_user_id !== ev.broadcaster_user_id
        && db.getChannel(ev.source_broadcaster_user_id)?.enabled) return;
    const bid = ev.broadcaster_user_id;
    spawns.noteChat(bid);

    const text = (ev.message?.text || "").trim();
    if (!text.startsWith("!")) return;
    const [rawCmd, ...args] = text.split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const uid = ev.chatter_user_id, login = ev.chatter_user_login, name = ev.chatter_user_name;
    const echo = ev.source_broadcaster_user_id && ev.source_broadcaster_user_id !== bid;
    const reply = (m) => m && pool.send(bid, m, echo ? undefined : ev.message_id); // can't reply-thread a partner channel's message

    // blocked accounts (blocklist.js) can't play or add the game: ignore them completely
    if (require("./blocklist").isBlocked(uid, login)) return;

    // ---- the bot's own channel: !join / !leave ----
    if (bid === botId() && uid !== botId() && (cmd === "!join" || cmd === "!leave")) {
      if (cmd === "!leave") {
        db.removeChannel(uid);
        await pool.leave(uid);
        return reply(`@${name} left your channel. Come back any time with !join.`);
      }
      if (require("./blocklist").isChannelBlocked(uid, login)) return reply(`@${name} sorry, Deviation Hunt isn't available for your channel.`);
      try {
        db.addChannel({ broadcaster_id: uid, login, display_name: name, joined_via: "chat" });
        await pool.join(uid);
        pool.refreshLive?.();
        return reply(`@${name} joined your channel! Deviations will start appearing while you're live. Mods: !hunt help. Type !leave here to remove me.`);
      } catch (e) {
        db.removeChannel(uid);
        if (e.message === "NEEDS_PERMISSION") return reply(`@${name} I need permission first: type /mod ${botLogin()} in your chat and !join again, or add me in one click at ${cfg.BASE_URL}`);
        console.error("[join] failed:", e.message);
        return reply(`@${name} couldn't join right now, try again in a minute.`);
      }
    }

    const channel = db.getChannel(bid);
    if (!channel?.enabled && bid !== botId()) return;

    if (cfg.PAUSED) {
      if (cmd === "!hunt") return reply(`${cfg.BOT_NAME} is paused for an update — it'll be back soon!`);
      return; // every other game command stays quiet while paused
    }

    // ---- catching: always allowed, no cooldown (one throw per spawn is enforced in game.js) ----
    const played = () => db.q.touchActive.run(bid, Date.now(), spawns.streamIds?.get(bid) && spawns.live.has(bid) ? spawns.streamIds.get(bid) : null, uid); // remembers where they play (free-unit notices)
    if (cmd === "!secure" || cmd === "!catch") {
      played();
      const r = spawns.attempt(bid, uid, login, name, args[0]);
      played();
      // any !secure in a live stream also switches on today's hourly perks (B 2026-10-07)
      const started = game.startHourly(uid, login, name, bid);
      if (!started) return reply(r);
      const note = game.HOURLY_ON_TEXT(uid);
      return reply(r ? (r.length + note.length < 495 ? `${r} ${note}` : r) : `@${name} ${note}`);
    }

    // ---- Legendary pool: !donate <amount|max> while a Legendary is loose (B 2026-10-08) ----
    if (cmd === "!donate" || cmd === "!pool") {
      played();
      if (cmd === "!pool" && !args[0]) { const st = spawns.poolState(bid); return reply(st ? `💰 Legendary pool: ${st.total.toLocaleString("en-US")} / ${st.goal.toLocaleString("en-US")} Starchrom from ${st.donors} donor${st.donors === 1 ? "" : "s"}${st.full ? " — FULL! Donors who !secure catch it for sure." : ` (+${+(st.bonus * 100).toFixed(2)}% catch chance for donors). !donate <amount> to add to it.`}` : null); }
      return reply(spawns.donate(bid, uid, login, name, args[0]));
    }

    // ---- imbon3s only: "!spawn legendary" (or "!hunt spawn legendary") releases a random Legendary (B 2026-10-08) ----
    const legendaryCmd = (cmd === "!spawn" && /^legend/i.test(args[0] || "")) || (cmd === "!hunt" && /^spawn$/i.test(args[0] || "") && /^legend/i.test(args[1] || ""));
    if (legendaryCmd) {
      if (login !== "imbon3s") return; // only him, anywhere the game runs
      const pick = game.rollLegendarySpawn();
      if (!pick) return reply("No Legendary deviations loaded right now.");
      const r = await spawns.spawn(bid, true, pick);
      if (r.error === "already") return reply("A deviation is already loose — secure it first!");
      return;
    }

    // ---- mods / broadcaster: !hunt ... ----
    if (cmd === "!hunt") {
      const sub = (args[0] || "").toLowerCase();
      const mod = isModOrOwner(ev);
      if (mod && sub === "spawn") {
        // always a random deviation — choosing one (or a variation/skin) was removed (B 2026-10-06)
        const r = await spawns.spawn(bid, true);
        if (r.error === "already") return reply("A deviation is already loose — secure it first!");
        return;
      }
      if (mod && sub === "interval") {
        const n = parseInt(args[1], 10);
        if (!(n >= 2 && n <= 120)) return reply("Usage: !hunt interval <minutes 2-120>");
        db.setSpawnInterval(bid, n);
        spawns.scheduleNext(bid);
        return reply(`Deviations will appear about every ${n} minutes while you're live.`);
      }
      if (mod && (sub === "chatdelay" || sub === "delay")) {
        if (args[1] === undefined) {
          const v = db.getSetting(`chatdelay:${bid}`);
          return reply(`Chat waits ${v === null ? cfg.RESULT_CHAT_DELAY_SECONDS : v}s after a deviation appears on screen and after it's secured/gets away, so the OBS Source shows it first (only while the OBS Source is on your stream). Change it: !hunt chatdelay <0-30>`);
        }
        const n = parseInt(args[1], 10);
        if (!(n >= 0 && n <= 30)) return reply("Usage: !hunt chatdelay <seconds 0-30> (0 = post right away)");
        db.setSetting(`chatdelay:${bid}`, String(n));
        return reply(n ? `Got it — spawns and results post in chat ${n}s after the OBS Source shows them.` : "Got it — spawns and results post in chat right away.");
      }
      if (mod && sub === "surprise") {
        const want = (args[1] || "").toLowerCase();
        if (want !== "on" && want !== "off") {
          const on = db.getSetting(`surprise:${bid}`) === "on";
          return reply(`Surprise mode is ${on ? "ON: chat and your OBS Source show variations/skins as the normal deviation until the result" : "OFF: chat and your OBS Source name a variation/skin as soon as it appears"}. Change it: !hunt surprise on / off.`);
        }
        db.setSetting(`surprise:${bid}`, want);
        return reply(want === "on"
          ? "Surprise mode on — chat and your OBS Source show every deviation as the normal one; variations and skins are only revealed when the result is posted."
          : "Surprise mode off — chat and your OBS Source name a variation or skin as soon as it appears.");
      }
      if (mod && sub === "spawnchat") {
        const want = (args[1] || "").toLowerCase();
        if (want !== "on" && want !== "off") {
          const off = db.getSetting(`spawnchat:${bid}`) === "off";
          return reply(`Spawn messages in chat are ${off ? "OFF (deviations only show on your OBS Source)" : "ON"}. Change it: !hunt spawnchat on / off. Results (who caught it or if it got away) always post in chat.`);
        }
        db.setSetting(`spawnchat:${bid}`, want);
        return reply(want === "off"
          ? "Got it — new deviations will only show on your OBS Source, not in chat. Who caught it / if it got away still posts in chat. (If your OBS Source isn't open, chat still announces them so the game keeps working.)"
          : "Got it — new deviations are announced in chat again.");
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
      if (mod && (sub === "obs" || sub === "overlay")) return reply(`OBS Source: in OBS add a Browser source (600×600) with ${require("./overlay").linkFor(bid)} — it shows the deviation and a countdown, and plays a spawn alert — tick "Control audio via OBS" so only your viewers hear it, not you (?sound=0 turns it off). Add ?countdown=1 to the link for a countdown to the next spawn between deviations, and ?demo=1 to preview it while you position it.`);
      if (mod && sub === "help") return reply("Mods: !hunt spawn (spawn now) · !hourlycheck · !hunt interval <min> · !hunt off / on · !hunt status · !hunt obs · !hunt chatdelay <sec> · !hunt spawnchat on/off · !hunt surprise on/off · !hunt leave");
      return reply(HELP());
    }

    // ---- mods / broadcaster: who has a running hourly timer in this channel ----
    if (cmd === "!hourlycheck") {
      if (!isModOrOwner(ev)) return;
      const key = `${bid}:hourlycheck`;
      if (Date.now() - (lastReply.get(key) || 0) < 10000) return; // one list per 10s per channel
      lastReply.set(key, Date.now());
      const msgs = game.hourlyCheck(bid);
      for (let i = 0; i < msgs.length; i++) await (i ? pool.send(bid, msgs[i]) : reply(msgs[i]));
      return;
    }

    // ---- everything else: light per-user cooldown ----
    const GAME_CMDS = ["!hourly", "!timercheck", "!timer", "!starchrom", "!sc", "!units", "!inv", "!shop", "!buy", "!daily", "!pods", "!pod", "!scrap", "!dev", "!hunttop", "!leaderboard", "!traits", "!stats", "!todaysleader", "!todayleader"];
    if (!GAME_CMDS.includes(cmd)) return;
    const key = `${bid}:${uid}:${cmd}`;
    if (!isModOrOwner(ev) && Date.now() - (lastReply.get(key) || 0) < USER_CD) return;
    lastReply.set(key, Date.now());

    // !daily may come right as the stream starts: ask Twitch first so where they play is recorded with this stream
    if ((cmd === "!daily" || cmd === "!hourly") && !(spawns.live.has(bid) && spawns.streamIds?.get(bid))) await pool.refreshLive?.();
    played();
    try {
    switch (cmd) {
      case "!starchrom": case "!sc": return reply(game.starchromText(uid, login, name));
      case "!units": case "!inv": return reply(game.inventory(uid, login, name));
      case "!shop": return reply(game.shop());
      case "!buy": return reply(game.buy(uid, login, name, args));
      case "!hourly": return reply(game.hourly(uid, login, name, bid));
      case "!timercheck": case "!timer": return reply(game.timerCheck(uid, login, name));
      case "!daily": {
        // the stream may have just started: ask Twitch right now instead of waiting for the next check
        return reply(game.daily(uid, login, name, bid));
      }
      case "!pod":
      case "!pods": {
        if (args[0]) { // !pods someone
          const other = db.q.getPlayerByLogin.get(args[0].replace(/^@/, "").toLowerCase());
          if (!other) return reply(`@${name} I don't know ${args[0]} yet.`);
          return reply(game.dex(other.user_id, other.login, other.display, cfg.BASE_URL).replace(/^@\S+/, other.display + "'s"));
        }
        return reply(game.dex(uid, login, name, cfg.BASE_URL));
      }
      case "!scrap": return reply(`@${name} scrapping is done in the Securement Pods panel under the stream, or on your collection page (sign in with Twitch): ${cfg.BASE_URL}/me`);
      case "!dev": {
        if (!args.length) return reply(`@${name} usage: !dev <deviation name>`);
        return reply(game.info(args.join(" "), cfg.BASE_URL) || `@${name} no deviation matches "${args.join(" ")}".`);
      }
      case "!traits": case "!stats": return reply(game.specimenText(uid, login, name, args.join(" "), cfg.BASE_URL));
      case "!hunttop": case "!leaderboard": return reply(game.top(cfg.BASE_URL));
      case "!todaysleader": case "!todayleader": return reply(game.todaysLeader(bid, spawns.live.has(bid) ? spawns.streamInfo?.get(bid)?.startedAt : null, name));
    }
    } finally { played(); }
  };
}

setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of lastReply) if (v < cutoff) lastReply.delete(k);
}, 10 * 60 * 1000).unref();

module.exports = { makeHandler, HELP };
