// game.js — the Deviation Hunt rules: players, spawns, securing, shop, daily
const cfg = require("./config");
const db = require("./db");
const data = require("./data");
const traits = require("./traits");
const { TIERS, VARIANT, UNITS, ECONOMY, GLOVES, SOUP, unitKey, isChaos, variantRule } = require("./rarity");

const SC = "Starchrom";
const shopCatalog = require("./shop");
const fmt = (n) => Number(n).toLocaleString("en-US");

// ---------------- players ----------------

function loadPlayer(userId, login, display) {
  let p = db.q.getPlayer.get(userId);
  if (!p) {
    db.q.insertPlayer.run(userId, login, display, ECONOMY.starterStarchrom, JSON.stringify(ECONOMY.starterUnits), Date.now(), Date.now());
    p = db.q.getPlayer.get(userId);
    p.isNew = true;
  } else if (login && (p.login !== login || p.display !== display)) {
    db.q.touchPlayer.run(login, display, userId);
    p.login = login; p.display = display;
  }
  p.units = JSON.parse(p.units || "{}");
  try { p.gloves = JSON.parse(p.gloves || "[]"); } catch { p.gloves = []; }
  if (p.gloves.length > 1) { const top = GLOVES.filter((g) => p.gloves.includes(g.id)).sort((a, b) => b.bonus - a.bonus)[0]; p.gloves = top ? [top.id] : []; } // one pair only
  { const g = GLOVES.find((x) => p.gloves.includes(x.id)); if (!g) p.glove_left = -1; else if (!(p.glove_left > 0)) p.glove_left = g.catches; } // older pairs start with a full count
  // older saves had Advanced/Elite/Anomaly units: fold them into plain Securement Units
  for (const k of ["advanced", "elite", "anomaly"]) if (p.units[k]) { p.units.standard = (p.units.standard || 0) + p.units[k]; delete p.units[k]; }
  return p;
}

const HOUR = 3600 * 1000;
const pctTxt = (x) => `${+(x * 100).toFixed(2)}%`;
// Hourly free units run only while the stream the player did !daily in is still live.
// index.js tells us each live channel's current Twitch stream id.
let streamOf = () => null;
const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: ECONOMY.dailyResetTz });
function dailyToday(userId) { const last = db.q.lastDaily.get(userId)?.at; return !!last && dayKey(last) === dayKey(Date.now()); }
function setStreamLookup(fn) { streamOf = fn; }
// Hourly perks belong to ONE live stream: the one where !hourly, the first !secure or !daily switched them on
// (B 2026-10-07). In another channel — or the next broadcast — the player types !hourly there to move them.
// switch hourly perks on for the stream in this channel (first one lands an hour later).
// true = just switched on here, false = already on here / channel not live
function startHourly(userId, login, display, bid) {
  const stream = bid ? streamOf(bid) : null;
  if (!stream) return false;
  const row = db.q.getPlayer.get(userId) || loadPlayer(userId, login, display);
  if (row.hourly_stream === stream) return false;
  const now = Date.now();
  // moving from another stream with a running timer: carry the timer over instead of restarting the hour,
  // so hopping between channels never costs the hourly unit (OldManSauce, B 2026-10-08). Still one stream at a time.
  const carry = row.hourly_stream && row.last_unit_at > now - HOUR && row.last_unit_at <= now;
  db.q.setHourlyOn.run(now, carry ? row.last_unit_at : now, stream, userId);
  return true;
}
const HOURLY_ON_TEXT = (userId) => {
  const row = userId && db.q.getPlayer.get(userId);
  const mins = row ? Math.max(1, Math.ceil(((row.last_unit_at || Date.now()) + HOUR - Date.now()) / 60000)) : 60;
  return mins < 60
    ? `⏰ Your hourly perks moved to this stream — next free Securement Unit + ${ECONOMY.hourlyStarchrom} Starchrom in ${mins}m.`
    : `⏰ Hourly perks on for this stream: +${ECONOMY.hourlyUnits} free Securement Unit and +${ECONOMY.hourlyStarchrom} Starchrom every hour while you're here (first one in 60m). Going to another channel? Type !hourly there to turn them on in that stream.`;
};
// !hourlycheck (mods/streamer): everyone whose hourly timer is running in this channel right now,
// soonest next unit first. Returns one or more chat messages (Twitch caps a message at 500 characters).
function hourlyCheck(bid) {
  if (!bid || !streamOf(bid)) return ["⏰ Hourly timers only run while the stream is live."];
  const list = db.q.playersInChannel.all(bid).filter((r) => hourlyOn(r))
    .map((r) => ({ name: r.display, mins: Math.max(1, Math.ceil(((r.last_unit_at || Date.now()) + HOUR - Date.now()) / 60000)) }))
    .sort((a, b) => a.mins - b.mins || a.name.localeCompare(b.name));
  if (!list.length) return ["⏰ Nobody's hourly timer is running here right now. Viewers start it with !hourly, !secure or !daily."];
  const out = []; let cur = `⏰ Hourly timers running here (${list.length}): `, first = true;
  for (const x of list) {
    const item = `${x.name} (${x.mins}m)`;
    if (!first && (cur + " · " + item).length > 480) { out.push(cur); cur = "⏰ …" + item; continue; }
    cur += (first ? "" : " · ") + item; first = false;
  }
  out.push(cur);
  return out;
}
// !timercheck: when is MY next free hourly unit?
function timerCheck(userId, login, display) {
  const p = loadPlayer(userId, login, display);
  if (!hourlyOn(p)) return `@${display} your hourly timer isn't on in this stream — type !hourly here to start it (your first !secure or !daily here starts it too). It runs in one stream at a time.`;
  return `@${display} ⏰ your next free Securement Unit + ${ECONOMY.hourlyStarchrom} Starchrom arrives in ${nextUnitIn(p)} (hourly perks are on for this stream).`;
}
function hourly(userId, login, display, bid) {
  if (!bid || !streamOf(bid)) return `@${display} !hourly only works while the stream is live. If the stream just started, Twitch can take a minute or two to show it as live — try again shortly.`;
  if (startHourly(userId, login, display, bid)) return `@${display} ${HOURLY_ON_TEXT(userId)} Don't forget !daily for a free supply drop.`;
  const p = loadPlayer(userId, login, display);
  return `@${display} your hourly perks are already on for this stream — next free Securement Unit + ${ECONOMY.hourlyStarchrom} Starchrom in ${nextUnitIn(p)}. Going to another channel? Type !hourly there to turn them on in that stream.`;
}
let announce = () => {};
function setAnnouncer(fn) { announce = fn; }

// Shop purchases made in the Twitch panel or on the website (not Securement Units) get a shout-out
// in the chat the buyer is playing in right now — the channel of their last game command, only while it's live.
function announcePurchase(userId, item, qty = 1) {
  if (!item || item.id === "unit" || item.kind === "units") return false;
  const row = db.q.getPlayer.get(userId);
  const ch = row?.last_channel;
  if (!ch || !streamOf(ch) || !db.getChannel(ch)?.enabled) return false;
  const what = item.kind === "gloves" ? `${item.name} (+${Math.round((item.bonus || 0) * 100)}% capture on every throw)` : item.kind === "soup" ? `${qty > 1 ? `${qty} bowls of ` : "a bowl of "}${item.name} (+${item.bonus * 100}% capture for ${qty > 1 ? `${qty} hours` : "1 hour"})` : `${qty > 1 ? `${qty}× ` : ""}${item.name}`;
  announce(ch, `🛒 @${row.display} just bought ${what} from the Shop! ${item.kind === "gloves" ? "🧤" : item.kind === "soup" ? "🍲" : "🎉"}`);
  return true;
}
// Hourly free units run while the player (a) switched them on today (!daily, !hourly or !secure) and (b) is in a live
// stream: the channel of their latest game command, during that same broadcast. It's a single
// "current stream", so watching several streams never earns more; switching streams keeps the timer.
const hourlyOn = (p) => { const cur = streamOf(p.last_channel); return !!cur && p.active_stream === cur && p.hourly_stream === cur; };

// for the panel: is the hourly timer running, and when does the next free unit land?
function hourlyStatus(p) {
  if (!hourlyOn(p)) return { state: "needs_daily" }; // panel: "Type !daily in a live stream to start…" (still true)
  return { state: "running", at: (p.last_unit_at || Date.now()) + HOUR };
}

function nextUnitIn(p) {
  if (!hourlyOn(p)) return "once you type !hourly in the live stream you're watching";
  const ms = (p.last_unit_at || Date.now()) + HOUR - Date.now();
  return `${Math.max(1, Math.ceil(ms / 60000))}m`;
}

function savePlayer(p) {
  db.q.savePlayer.run({ user_id: p.user_id, starchrom: p.starchrom, units: JSON.stringify(p.units), last_daily: p.last_daily, attempts: p.attempts, last_unit_at: p.last_unit_at || Date.now(), gloves: JSON.stringify(p.gloves || []), extra_cap: p.extra_cap || 0, soup_until: p.soup_until || 0, glove_left: p.glove_left ?? -1 });
}

// "303 Starchrom | 21 deviations (12/61 unique)" — used where the full unit list is too noisy
function bagText(p) {
  const c = collectionSummary(p.user_id);
  return `${fmt(p.starchrom)} ${SC} | ${c.total} deviation${c.total === 1 ? "" : "s"} (${c.species}/${data.all().length} unique) — see your deviations, ratings & traits: ${cfg.BASE_URL}/u/${p.login}`;
}

function unitsText(p) {
  const parts = [`${p.units.standard || 0} Securement Units`];
  return `${fmt(p.starchrom)} ${SC} | ${parts.join(", ")}`;
}

// ---------------- spawns ----------------

function weightedPick(items, weightOf) {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = Math.random() * total;
  for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
  return items[items.length - 1];
}

// Pick a deviation: first a rarity tier by weight, then a deviation in it, then maybe a variant
function rollSpawn() {
  const all = data.all();
  if (!all.length) return null;
  // the Chaos variation is its own 1-in-375 roll across every spawn
  const chaosDevs = all.filter((d) => d.variants.some(isChaos));
  if (chaosDevs.length && Math.random() < VARIANT.chaos.chance) {
    const dev = chaosDevs[Math.floor(Math.random() * chaosDevs.length)];
    return { dev, variant: dev.variants.find(isChaos) };
  }
  const tiersPresent = Object.keys(TIERS).filter((t) => all.some((d) => d.rarity === t));
  const tier = weightedPick(tiersPresent, (t) => TIERS[t].weight);
  const pool = all.filter((d) => d.rarity === tier);
  const dev = pool[Math.floor(Math.random() * pool.length)];
  let variant = null;
  const skins = dev.variants.filter((v) => v.kind === "skin");
  const vars = dev.variants.filter((v) => v.kind === "variation" && !isChaos(v)); // Chaos only comes from its own roll
  const r = Math.random();
  if (skins.length && r < VARIANT.skin.chance) variant = skins[Math.floor(Math.random() * skins.length)];
  else if (vars.length && r < VARIANT.skin.chance + VARIANT.variation.chance) variant = vars[Math.floor(Math.random() * vars.length)];
  return { dev, variant }; // the variant stays secret until the result is posted
}

// a random Legendary (variation/skin/Chaos), weighted like natural spawns — for imbon3s's "!spawn legendary"
function rollLegendarySpawn() {
  const opts = [];
  for (const dev of data.all()) for (const v of dev.variants) {
    const w = isChaos(v) ? VARIANT.chaos.chance : v.kind === "skin" ? VARIANT.skin.chance : VARIANT.variation.chance;
    opts.push({ dev, variant: v, w });
  }
  if (!opts.length) return null;
  return weightedPick(opts, (o) => o.w);
}

const variantLabel = (v) => (isChaos(v) ? "🌀 Chaos Variation" : `✨ ${v.kind === "skin" ? "Skin" : "Variation"}: ${v.name}`);

// "P4·M2", with a star for a perfect 5/5
const ratingTag = (sp) => `${sp.power}/${sp.mood}${sp.power === 5 && sp.mood === 5 ? " ⭐" : ""}`;

// what players see: always the normal deviation — a variation/skin is only revealed in the result
// a variation/skin is named in chat from the start unless the channel turned on "!hunt surprise on"
// (then chat AND the OBS Source show the normal deviation until the result) — B 2026-10-05
const isRevealed = (bid, s) => !!s.variant && db.getSetting(`surprise:${bid}`) !== "on";
function spawnName(s, bid) { return bid !== undefined && isRevealed(bid, s) ? `${s.dev.name} (${variantLabel(s.variant)})` : s.dev.name; }
const logName = (s) => (s.variant ? `${s.dev.name} — ${s.variant.name}` : s.dev.name);

// the best gloves a player owns (null if none)
const unitCap = (p) => shopCatalog.unitCap(p);
const podsUsed = (p) => shopCatalog.podsUsed(p);
const unitRoom = (p) => Math.max(0, unitCap(p) - podsUsed(p));
// free units (hourly, !daily) stop at ECONOMY.freeUnitCap Pods; after that it's Starchrom only, up to the full cap (B 2026-10-10)
const freeRoom = (p) => Math.max(0, Math.min(unitRoom(p), ECONOMY.freeUnitCap - podsUsed(p)));

// Capture Soup: minutes left (0 = none active)
const soupLeftMin = (p, now = Date.now()) => Math.max(0, Math.ceil(((p.soup_until || 0) - now) / 60000));

function bestGlove(p) {
  let best = null;
  for (const g of GLOVES) if ((p.gloves || []).includes(g.id) && (!best || g.bonus > best.bonus)) best = g;
  return best;
}

function catchChance(s, unit, bonus = 0) {
  // variations and skins are always Legendary with their own flat capture rate
  const v = variantRule(s.variant);
  if (v) return Math.min(ECONOMY.maxCatchChance, v.catch + bonus);
  const c = TIERS[s.dev.rarity].catch * UNITS[unit].mult;
  return Math.min(ECONOMY.maxCatchChance, c + bonus);
}

function rewardFor(s) {
  const v = variantRule(s.variant);
  if (v) return TIERS[v.rarity].reward * v.rewardMult;
  return TIERS[s.dev.rarity].reward;
}

function spawnAnnouncement(s, bid) {
  // surprise mode on: never says if it's a variation/skin (the result reveals it); off: says so right away
  if (isRevealed(bid, s)) return `👀 A 🌟 LEGENDARY ${s.dev.name} (${variantLabel(s.variant)}) has been spotted in the wild! Type !secure within ${cfg.SPAWN_WINDOW_SECONDS}s to catch it. 💰 To add to the ${fmt(ECONOMY.legendaryPoolGoal)} ${SC} pool for a 100% catch rate, donate up to ${fmt(ECONOMY.legendaryPoolMax)} ${SC} using !donate <amount>`;
  return `👀 A ${s.dev.name} has been spotted in the wild! Type !secure within ${cfg.SPAWN_WINDOW_SECONDS}s to catch it.`;
}

const RESTORE_GRACE_S = 60; // after a restart, a loose deviation gets at least this long again

// Per-channel spawn state lives in memory; the result goes to SQLite when it resolves
class Spawns {
  constructor(send) {
    this.send = send;              // (broadcasterId, text) => Promise
    this.active = new Map();       // bid -> { dev, variant, endsAt, attempts: Map(userId -> {name, unit}) , timer }
    this.nextAt = new Map();       // bid -> ts of the next spawn
    this.nextFrom = new Map();     // bid -> when that wait started (the OBS progress bar fills from here to nextAt)
    this.lastChat = new Map();     // bid -> ts of the last viewer message
    this.live = new Set();         // bids currently live
    this.lastResult = new Map();   // bid -> who caught the last spawn (for the OBS source results card)
    this.closed = new Map();       // bid -> { at, name, told:Set } the moment the last spawn could no longer be captured
    this.overlaySeen = new Map();  // bid -> ts the channel's OBS Source last polled (it's on their stream)
  }

  // Twitch video runs a few seconds behind chat, so on channels showing the OBS Source the result
  // message waits until the "who caught it" card is on stream. No overlay = no delay.
  overlayOn(bid) { return Date.now() - (this.overlaySeen.get(bid) || 0) < 60000; }
  // mods can turn off the "spotted in the wild" chat message (OBS Source only); results always post
  spawnChatOff(bid) { return db.getSetting(`spawnchat:${bid}`) === "off"; }
  chatDelayMs(bid) {
    if (!(Date.now() - (this.overlaySeen.get(bid) || 0) < 60000)) return 0;
    const v = db.getSetting(`chatdelay:${bid}`);
    const sec = v === null ? cfg.RESULT_CHAT_DELAY_SECONDS : Number(v);
    return Math.max(0, Math.min(30, sec || 0)) * 1000;
  }
  sendResult(bid, text) {
    const wait = this.chatDelayMs(bid);
    if (!wait) return this.send(bid, text);
    setTimeout(() => Promise.resolve(this.send(bid, text)).catch((e) => console.error("[resolve] delayed send", e.message)), wait);
  }

  // the bot's own channel (24/7 stream) keeps spawning with a quiet chat; any channel can opt in with setting alwayson:<bid>=on
  alwaysOn(bid) { return bid === db.getBotAccount()?.user_id || db.getSetting(`alwayson:${bid}`) === "on"; }

  noteChat(bid) { this.lastChat.set(bid, Date.now()); }

  // ---- persistence: a loose deviation survives restarts/redeploys ----
  persist(bid) {
    const s = this.active.get(bid);
    if (!s) return db.q.deleteActive.run(bid);
    db.q.saveActive.run(bid, JSON.stringify({ dev: s.dev.id, variant: s.variant ? { name: s.variant.name, kind: s.variant.kind } : null, endsAt: s.endsAt, attempts: [...s.attempts], warned: [...s.warned], legendary: s.legendary || null, pool: s.pool ? [...s.pool] : [] }));
  }

  // called once at startup: bring back loose deviations and finish any that ran out while we were down
  restore() {
    for (const row of db.q.listActive.all()) {
      try {
        const d = JSON.parse(row.data);
        const dev = data.get(d.dev);
        if (!dev) { db.q.deleteActive.run(row.broadcaster_id); continue; }
        const variant = d.variant ? dev.variants.find((v) => v.name === d.variant.name) || d.variant : null;
        const s = { dev, variant, endsAt: d.endsAt, attempts: new Map(d.attempts), warned: new Set(d.warned), legendary: d.legendary || null, pool: new Map(d.pool || []) };
        const bid = row.broadcaster_id;
        // chat typed while the bot was restarting never arrived, so give everyone a fresh chance:
        // at least RESTORE_GRACE seconds from now, and tell the channel it's still loose
        const graceMs = RESTORE_GRACE_S * 1000;
        const extended = d.endsAt - Date.now() < graceMs;
        if (extended) s.endsAt = Date.now() + graceMs;
        const wait = Math.max(2000, s.endsAt - Date.now());
        if (extended || d.endsAt > Date.now()) setTimeout(() => {
          if (this.active.get(bid) !== s) return;
          const left = Math.max(1, Math.round((s.endsAt - Date.now()) / 1000));
          Promise.resolve(this.send(bid, `🔄 The bot just restarted — the ${spawnName(s, bid)} is still loose! If you typed !secure in the last minute, type it again. You have ${left}s.`)).catch(() => {});
        }, 5000);
        s.timer = setTimeout(() => this.resolve(bid).catch((e) => console.error("[resolve]", e)), wait);
        this.active.set(bid, s);
    this.persist(bid);
        console.log(`[spawn] restored ${bid}: ${logName(s)}, ${s.attempts.size} throws, resolving in ${Math.round(wait / 1000)}s`);
      } catch (e) {
        console.error("[spawn] restore failed:", e.message);
        db.q.deleteActive.run(row.broadcaster_id);
      }
    }
  }

  intervalMs(bid) {
    const ch = db.getChannel(bid);
    const min = ch?.interval_min || cfg.SPAWN_INTERVAL_MIN;
    return min * 60 * 1000 * (0.8 + Math.random() * 0.4); // ±20% so it doesn't feel mechanical
  }

  scheduleNext(bid, fromNow) { this.nextFrom.set(bid, Date.now()); this.nextAt.set(bid, Date.now() + (fromNow ?? this.intervalMs(bid))); }

  setLive(bid, isLive) {
    const was = this.live.has(bid);
    if (isLive && !was) { this.live.add(bid); this.scheduleNext(bid, Math.min(this.intervalMs(bid), 3 * 60 * 1000)); }
    if (!isLive && was) { this.live.delete(bid); this.nextAt.delete(bid); }
  }

  // called every ~15s
  tick() {
    if (cfg.PAUSED) return;
    const now = Date.now();
    for (const ch of db.listEnabledChannels()) {
      const bid = ch.broadcaster_id;
      if (!ch.spawns_on || this.active.has(bid)) continue;
      if (!cfg.SPAWN_OFFLINE && !this.live.has(bid)) continue;
      if (!this.nextAt.has(bid)) this.scheduleNext(bid);
      if (now < this.nextAt.get(bid)) continue;
      // only spawn if people are actually chatting (not on always-on channels like the 24/7 stream)
      if (!this.alwaysOn(bid) && now - (this.lastChat.get(bid) || 0) > cfg.ACTIVITY_WINDOW_MIN * 60 * 1000) { this.scheduleNext(bid, 60 * 1000); continue; }
      this.spawn(bid).catch((e) => console.error(`[spawn] ${bid} failed:`, e.message));
    }
  }

  // pick: optional deviation (from !hunt spawn <name>) — spawns that one, no variant
  async spawn(bid, forced, pick = null) {
    if (cfg.PAUSED) return { error: "paused" };
    if (this.active.has(bid)) return { error: "already" };
    // pick: a deviation, or { dev, variant } from !hunt spawn <deviation> <variation/skin>
    const s = pick ? (pick.dev ? { dev: pick.dev, variant: pick.variant || null } : { dev: pick, variant: null }) : rollSpawn();
    if (s) s.legendary = traits.rollLegendary(s.dev.name, s.dev.category); // hidden 1-in-400 Legendary trait, never announced
    if (!s) return { error: "nodata" };
    s.attempts = new Map();
    s.warned = new Set();
    s.pool = new Map(); // Legendary pool: userId -> { display, amount }
    // With the OBS Source on stream it shows up on screen first and chat hears about it after the
    // chat delay (stream video lags chat). Behind the scenes the window is extended by that delay so
    // chat still gets the full SPAWN_WINDOW_SECONDS; the overlay and chat both just show the normal time.
    const delay = this.chatDelayMs(bid);
    s.windowMs = cfg.SPAWN_WINDOW_SECONDS * 1000 + delay;
    s.endsAt = Date.now() + s.windowMs;
    s.shownEndsAt = s.endsAt - delay; // the OBS Source counts down the normal window; the extra time is silent
    s.timer = setTimeout(() => this.resolve(bid).catch((e) => console.error("[resolve]", e)), s.windowMs);
    this.active.set(bid, s);
    this.persist(bid);
    this.scheduleNext(bid, this.intervalMs(bid) + s.windowMs);
    console.log(`[spawn] ${bid}: ${logName(s)} (${s.dev.rarity})${forced ? " [forced]" : ""}${delay ? ` [chat in ${delay / 1000}s]` : ""}`);
    // "!hunt spawnchat off": with the OBS Source on stream, the spawn is only shown on screen (results still post in chat)
    if (this.spawnChatOff(bid) && this.overlayOn(bid)) { /* quiet spawn: OBS only */ }
    else if (!delay) await this.send(bid, spawnAnnouncement(s, bid));
    else setTimeout(() => { if (this.active.get(bid) === s && !(this.spawnChatOff(bid) && this.overlayOn(bid))) Promise.resolve(this.send(bid, spawnAnnouncement(s, bid))).catch((e) => console.error("[spawn] delayed send", e.message)); }, delay);
    return { spawn: s };
  }

  // ---- Legendary pool (B 2026-10-08) ----
  poolTotal(s) { let t = 0; for (const d of (s.pool || new Map()).values()) t += d.amount; return t; }
  poolFull(s) { return this.poolTotal(s) >= ECONOMY.legendaryPoolGoal; }
  // catch bonus for donors while the pool isn't full: +1.75% per donor
  poolBonus(s) { return (s.pool ? s.pool.size : 0) * ECONOMY.legendaryPoolPerDonor; }
  poolState(bid) {
    const s = this.active.get(bid);
    if (!s || !isRevealed(bid, s)) return null;
    return { total: this.poolTotal(s), goal: ECONOMY.legendaryPoolGoal, donors: (s.pool || new Map()).size, full: this.poolFull(s), bonus: this.poolBonus(s) };
  }
  // !donate <amount|max> while a Legendary is loose. Returns a reply (or null).
  donate(bid, userId, login, display, amountWord) {
    const s = this.active.get(bid);
    if (!s) return null;
    const warn = (msg) => { const k = `pool:${userId}:${msg.slice(0, 20)}`; if (s.warned.has(k)) return null; s.warned.add(k); return msg; };
    if (!isRevealed(bid, s)) return warn(`@${display} the Legendary pool only opens when a Legendary deviation (a Variation or Skin) is spotted.`);
    const goal = ECONOMY.legendaryPoolGoal, max = ECONOMY.legendaryPoolMax;
    const total = this.poolTotal(s);
    if (total >= goal) return warn(`@${display} the pool is already full! Donors who throw !secure catch the ${spawnName(s, bid)} for sure.`);
    const mine = s.pool.get(userId)?.amount || 0;
    const allowance = Math.min(max - mine, goal - total);
    if (allowance <= 0) return warn(`@${display} you've already put the most you can (${fmt(max)} ${SC}) into this pool. Make sure you !secure!`);
    const w = String(amountWord || "").toLowerCase().replace(/,/g, "");
    let amount = w === "max" || w === "all" ? allowance : parseInt(w, 10);
    if (!(amount > 0)) return `@${display} usage: !donate <amount> (1-${fmt(max)}) or !donate max. The pool is at ${fmt(total)} / ${fmt(goal)} ${SC}.`;
    amount = Math.min(amount, allowance);
    const p = loadPlayer(userId, login, display);
    if (p.starchrom < amount) {
      if (p.starchrom <= 0) return warn(`@${display} you don't have any ${SC} to donate.`);
      amount = Math.min(amount, p.starchrom);
    }
    p.starchrom -= amount;
    savePlayer(p);
    s.pool.set(userId, { display, amount: mine + amount });
    this.persist(bid);
    const now = total + amount;
    if (now >= goal) {
      const names = [...s.pool.values()].map((d) => d.display);
      const shown = names.length > 12 ? `${names.slice(0, 12).join(", ")} +${names.length - 12} more` : names.join(", ");
      Promise.resolve(this.send(bid, `🎯💰 LEGENDARY POOL FILLED! ${fmt(goal)} ${SC} — every donor who throws !secure WILL secure the ${spawnName(s, bid)}! Donors: ${shown}`)).catch(() => {});
      return `@${display} 💰 you put in ${fmt(amount)} ${SC} and filled the pool!${s.attempts.has(userId) ? " You've already thrown, so it's yours." : " Now type !secure to claim it!"}`;
    }
    return `@${display} 💰 +${fmt(amount)} ${SC} to the Legendary pool: ${fmt(now)} / ${fmt(goal)}. ${s.pool.size} donor${s.pool.size === 1 ? "" : "s"} = +${pctTxt(this.poolBonus(s))} catch chance for every donor until it fills.${s.attempts.has(userId) ? "" : " Don't forget to !secure!"}`;
  }

  // A viewer types !secure [unit]. Returns a reply string, or null to stay quiet.
  attempt(bid, userId, login, display, unitWord) {
    const s = this.active.get(bid);
    if (!s) {
      // just closed: tell a late thrower once (no Starchrom taken); otherwise stay silent so chat isn't spammed
      const c = this.closed.get(bid);
      if (c && Date.now() - c.at < 30000 && !c.told.has(userId)) { c.told.add(userId); return `@${display} too late — the ${c.name} can no longer be captured. Nothing was spent. Wait for the next one!`; }
      return null;
    }
    // tell each viewer about a problem at most once per spawn
    const warn = (msg) => { if (s.warned.has(userId)) return null; s.warned.add(userId); return msg; };
    if (s.attempts.has(userId)) return warn(`@${display} you already threw at this ${spawnName(s, bid)} — one throw per deviation. Wait and see if you secured it!`);
    const unit = "standard";
    const p = loadPlayer(userId, login, display);
    if (p.starchrom < ECONOMY.throwCost) {
      return warn(`@${display} a throw costs ${ECONOMY.throwCost} ${SC} and you have ${fmt(p.starchrom)}. ${dailyReady(userId) ? "Claim !daily for +" + ECONOMY.daily.starchrom + " " + SC + "." : "Catching deviations earns more."}`);
    }
    if (!(p.units.standard > 0)) {
      return warn(`@${display} you have no empty Securement Unit to house a deviation. ${hourlyOn(p) ? `Your next free one arrives in ${nextUnitIn(p)}` : dailyReady(userId) ? "Claim !daily for 1 now (plus 1 free every hour in this stream)" : `Your !daily resets at midnight Central (in ${untilReset()})`}, or !buy <amount> for ${fmt(UNITS.standard.price)} ${SC} each (you have ${fmt(p.starchrom)}).`);
    }
    p.starchrom -= ECONOMY.throwCost;
    db.addSpent(ECONOMY.throwCost);
    p.units[unit] -= 1; // held for this spawn: kept if you catch it (the deviation lives in it), returned if it breaks free
    p.attempts += 1;
    savePlayer(p);
    const glove = bestGlove(p);
    const soupMin = soupLeftMin(p);
    s.attempts.set(userId, { login, display, unit, isNew: p.isNew, glove: glove ? glove.id : null, bonus: (glove ? glove.bonus : 0) + (soupMin ? SOUP.bonus : 0) });
    this.persist(bid);
    const left = p.units[unit];
    const throwTxt = `🎯 Threw at the ${spawnName(s, bid)} (−${ECONOMY.throwCost} ${SC}, Left: ${fmt(p.starchrom)}). You'll have ${left} Securement Pod${left === 1 ? "" : "s"} left if you capture it.${glove ? ` 🧤 ${glove.name} +${Math.round(glove.bonus * 100)}% (${p.glove_left} catch${p.glove_left === 1 ? "" : "es"} left)` : ""}${soupMin ? ` 🍲 Capture Soup +${SOUP.bonus * 100}% (${soupMin}m left)` : ""}`;
    if (p.isNew) return `@${display} welcome, Meta! You started with ${ECONOMY.starterUnits.standard} Securement Units and ${ECONOMY.starterStarchrom} ${SC}. ${throwTxt} Type !daily for more, plus 1 free unit every hour this stream.`;
    return `@${display} ${throwTxt}`;
  }

  async resolve(bid) {
    const s = this.active.get(bid);
    if (!s) return;
    this.active.delete(bid);
    db.q.deleteActive.run(bid);
    clearTimeout(s.timer);
    const name = spawnName(s, bid);
    // the window is over: say so in chat right away (90s after chat saw the spawn), then the result follows
    this.closed.set(bid, { at: Date.now(), name, told: new Set() });
    const timeUp = `⏱️ Time's up! The ${name} can no longer be captured.`;
    if (this.chatDelayMs(bid)) Promise.resolve(this.send(bid, `${timeUp} Results coming up...`)).catch((e) => console.error("[resolve] time's up", e.message));
    const prefix = this.chatDelayMs(bid) ? "" : `${timeUp} `;
    // Legendary pool: filled -> it's spent (donors who threw catch for sure, below); not filled -> still spent (no refunds, B 2026-10-08)
    let poolNote = "";
    if (s.pool && s.pool.size) {
      const total = this.poolTotal(s);
      db.addSpent(total);
      if (!this.poolFull(s)) poolNote = ` 💰 The Legendary pool didn't fill (${fmt(total)} / ${fmt(ECONOMY.legendaryPoolGoal)}).`;
    }
    if (!s.attempts.size) {
      db.logSpawn(bid, s.dev.id, s.variant?.name, 0, 0);
      db.bumpChannel(bid, 0);
      this.recordResult(bid, s, [], [], 0);
      return this.sendResult(bid, `${prefix}💨 ${name} slipped away. Nobody tried to secure it...${poolNote}`);
    }
    const caught = [], escaped = [], firsts = [], winners = [], legendWins = [], wornOut = [];
    let legendReward = 0;
    const poolFull = s.pool && s.pool.size && this.poolFull(s);
    const reward = rewardFor(s);
    db.tx(() => {
      for (const [userId, a] of s.attempts) {
        const p = loadPlayer(userId, a.login, a.display);
        const donor = s.pool && s.pool.has(userId);
        if ((poolFull && donor) || Math.random() < catchChance(s, a.unit, (a.bonus || 0) + (donor ? this.poolBonus(s) : 0))) {
          const v = s.variant; // secret until now: the spawn looked like the normal deviation
          const variant = v?.name || "";
          const vr = variantRule(v);
          const got = vr ? TIERS[vr.rarity].reward * vr.rewardMult : reward;
          const had = db.q.getCatch.get(userId, s.dev.id, variant);
          db.q.addCatch.run(userId, s.dev.id, variant, v?.kind || "base", Date.now(), bid);
          const sp = traits.rollSpecimen(s.dev.name, variant, s.dev.variants.map((x) => x.name), s.dev.category, s.legendary);
          db.q.addSpecimen.run({ user_id: userId, deviation: s.dev.id, variant, ...sp, caught_at: Date.now(), channel: bid });
          p.starchrom += got + (had ? 0 : ECONOMY.newSpeciesBonus);
          if (!had) firsts.push(a.display);
          if (v) { legendWins.push(a.display); legendReward = got; }
          caught.push(`a ${ratingTag(sp)} by @${a.display}`);
          winners.push({ name: a.display, rating: ratingTag(sp) });
          // gloves wear out: a successful catch made wearing them uses one up
          if (a.glove && p.gloves.includes(a.glove) && p.glove_left > 0 && --p.glove_left === 0) {
            wornOut.push(`@${a.display}'s ${GLOVES.find((g) => g.id === a.glove).name}`);
            p.gloves = []; p.glove_left = -1;
          }
        } else {
          p.units[a.unit] = (p.units[a.unit] || 0) + 1; // it broke free, so the unit it was going into is still empty
          escaped.push(a.display);
        }
        savePlayer(p);
      }
    })();
    db.logSpawn(bid, s.dev.id, s.variant?.name, s.attempts.size, caught.length);
    db.bumpChannel(bid, caught.length);
    this.recordResult(bid, s, winners, escaped, reward);

    const list = (arr, max = 12) => arr.length > max ? `${arr.slice(0, max).join(", ")} +${arr.length - max} more` : arr.join(", ");
    let msg;
    if (caught.length) {
      // banner: one ⭐ for a normal catch; if anyone's turned out to be a variation/skin/Chaos, the 🌟🌟🌟🌟🌟 LEGENDARY banner
      const legend = legendWins.length > 0;
      const stars = legend ? "🌟".repeat(5) : "⭐";
      const pay = `+${legend ? legendReward : reward} ${SC} each`;
      msg = `${stars} ${legend ? "LEGENDARY " : ""}SECURED! ${stars} ${name}${s.variant && !isRevealed(bid, s) ? ` — it was a ${variantLabel(s.variant)} (Legendary)!` : ""} — ${list(caught, 7)}! 🔒 ${pay}.`;
      if (firsts.length) msg += ` 📖 New entry for ${list(firsts, 8)} (+${ECONOMY.newSpeciesBonus}).`;
      if (escaped.length) msg += ` It broke free from ${list(escaped, 6)}.`;
    } else {
      msg = `💥 ${name} got away from ${list(escaped, 8)}!${s.variant && !isRevealed(bid, s) ? ` It was a ${variantLabel(s.variant)} (Legendary)!` : ""} Better luck next time.`;
    }
    msg += poolNote;
    if (wornOut.length) msg += ` 🧤 ${list(wornOut, 6)} wore out — !buy a new pair.`;
    msg += caught.length ? ` | !traits ${s.dev.id} for traits` : ` | !pods to see your collection`;
    return this.sendResult(bid, prefix + msg);
  }

  recordResult(bid, s, winners, escaped, reward) {
    const tier = s.dev.rarity;
    const legend = !!s.variant;
    this.lastResult.set(bid, {
      id: `${s.dev.id}:${s.endsAt}:done`, at: Date.now(),
      name: s.dev.name, img: (s.variant && s.variant.img) || s.dev.img, // revealed now
      tier: legend ? "legendary" : tier, tierLabel: TIERS[legend ? "legendary" : tier].label,
      variant: s.variant ? variantLabel(s.variant) : null,
      stars: legend ? 5 : 1, legend,
      winners, escaped, reward, tried: s.attempts.size,
    });
  }

  status(bid) {
    const s = this.active.get(bid);
    return s ? { name: spawnName(s, bid), secondsLeft: Math.max(0, Math.round((s.endsAt - Date.now()) / 1000)), attempts: s.attempts.size } : null;
  }
}

// ---------------- other commands ----------------

// !daily: once per day (resets at midnight Central), and only during a live stream. It also
// points the player's hourly free units at that stream — they only ever run in one stream.
function untilReset(now = Date.now()) {
  const t = new Date(now).toLocaleTimeString("en-GB", { timeZone: ECONOMY.dailyResetTz, hour12: false }).split(":").map(Number);
  const mins = Math.max(1, Math.ceil((24 * 3600 - (t[0] % 24) * 3600 - t[1] * 60 - t[2]) / 60));
  return `${Math.floor(mins / 60) ? `${Math.floor(mins / 60)}h ` : ""}${mins % 60}m`;
}
const dailyReady = (userId) => !dailyToday(userId);

function daily(userId, login, display, bid) {
  const stream = bid ? streamOf(bid) : null;
  if (!stream) return `@${display} !daily only works while the stream is live. If the stream just started, Twitch can take a minute or two to show it as live — try !daily again shortly.`;
  const p = loadPlayer(userId, login, display);
  if (!dailyReady(userId)) {
    const n = db.q.countDaily.get(userId).n;
    return `@${display} you already claimed today's !daily (${fmt(n)} check-in${n === 1 ? "" : "s"} so far) — it resets at midnight Central (in ${untilReset()}).${hourlyOn(p) ? ` Next free Securement Unit in ${nextUnitIn(p)}.` : ""}`;
  }
  p.last_daily = Date.now();
  p.starchrom += ECONOMY.daily.starchrom;
  const got = [];
  for (const [k, n0] of Object.entries(ECONOMY.daily.units)) { const n = Math.min(n0, freeRoom(p)); if (!n) { got.push(`no Securement Unit (free units stop at ${ECONOMY.freeUnitCap} Securement Pods — !buy more with ${SC}, up to ${unitCap(p)})`); continue; } p.units[k] = (p.units[k] || 0) + n; got.push(`${n} ${UNITS[k].label}${n === 1 ? "" : "s"}`); }
  db.tx(() => {
    savePlayer(p);
    db.q.addDaily.run(userId, stream, bid, Date.now());
    db.q.setDailyStream.run(bid, stream, userId);
  })();
  startHourly(userId, login, display, bid); // !daily also turns hourly perks on for this stream (keeps a clock already running here)
  const checkins = db.q.countDaily.get(userId).n;
  return `@${display} ✅ Check-in #${fmt(checkins)}! 📦 Daily supply drop: +${ECONOMY.daily.starchrom} ${SC} and ${got.join(", ")}! Hourly perks are on for this stream too: 1 free Securement Unit + ${ECONOMY.hourlyStarchrom} ${SC} every hour while you're here (in another channel, type !hourly there). ${bagText(p)}`;
}

function shop() {
  const items = shopCatalog.ITEMS.map((i) => `${i.name}${i.bonus ? ` (+${+(i.bonus * 100).toFixed(1)}% catch${i.kind === "soup" ? " for 1 hour" : i.kind === "gloves" ? `, ${GLOVES.find((g) => g.id === i.glove).catches} catches` : ""})` : ""}: ${fmt(i.price)} ${SC}`).join(" · ");
  return `🛒 ${items} — !buy <amount> for units, !buy soup, !buy rustic / bbq / savior for gloves (or the panel's Shop tab). One pair at a time; gloves wear out after that many successful catches (no refunds).`;
}

// !buy 3  /  !buy unit 3  /  !buy savior — defaults to Securement Units
function buy(userId, login, display, args) {
  const qtyWord = args.find((a) => /^\d+$/.test(a || ""));
  const itemWord = args.filter((a) => !/^\d+$/.test(a || "")).join(" ");
  const item = itemWord ? shopCatalog.find(itemWord) : shopCatalog.ITEMS[0];
  if (!item) return `@${display} the shop doesn't sell "${itemWord}". Type !shop to see what's for sale.`;
  const qty = Math.max(1, Math.min(item.maxQty, parseInt(qtyWord || "1", 10) || 1));
  const p = loadPlayer(userId, login, display);
  const r = shopCatalog.purchase(p, item.id, qty);
  if (!r.ok && r.error === "owned") return `@${display} you already own ${item.name}.`;
  if (!r.ok && r.error === "full") return `@${display} your Securement Pods are full (${r.cap}/${r.cap} — caught deviations and empty units both count). Scrap extras in the Securement Pods panel under the stream to free some up.`;
  if (!r.ok && r.error === "too_many") return `@${display} you have ${r.cap} Securement Pods (caught deviations + empty units), so you can buy up to ${r.room} more Securement Units right now.`;
  if (!r.ok && r.error === "outclassed") return `@${display} you already wear ${r.better.name} (+${Math.round(r.better.bonus * 100)}%), which beat ${item.name}. You wear one pair at a time.`;
  const label = item.kind === "gloves" ? item.name : item.kind === "soup" ? `${qty} bowl${qty > 1 ? "s" : ""} of ${item.name}` : `${qty} ${item.name}${qty > 1 ? "s" : ""}`;
  if (!r.ok) return `@${display} ${label} ${qty > 1 || item.kind === "gloves" ? "cost" : "costs"} ${fmt(item.price * qty)} ${SC} but you have ${fmt(p.starchrom)}. Earn more by securing deviations and !daily, or scrap extras in the Securement Pods panel.`;
  savePlayer(p);
  if (item.kind === "gloves") {
    const old = r.replaced ? ` They replace your ${r.replaced.name}.` : "";
    return `@${display} 🧤 bought ${item.name} for ${fmt(r.cost)} ${SC}! +${Math.round(item.bonus * 100)}% catch chance on every throw for your next ${GLOVES.find((g) => g.id === item.glove).catches} successful catches.${old} You have ${fmt(p.starchrom)} ${SC} left.`;
  }
  if (item.kind === "soup") return `@${display} 🍲 bought ${label} for ${fmt(r.cost)} ${SC}! +${SOUP.bonus * 100}% catch chance on every throw for the next ${soupLeftMin(p)} minutes (stacks with gloves). You have ${fmt(p.starchrom)} ${SC} left.`;
  return `@${display} bought ${label} for ${fmt(r.cost)} ${SC} — you now have ${p.units.standard || 0} Securement Units (${podsUsed(p)}/${unitCap(p)} Securement Pods used). ${bagText(p)}`;
}

// The specimen a deviation's card features: your best-rated skin if you have one, else your best-rated
// variation, else your best-rated specimen — so the card's picture, name and traits all match.
// Best first: skin > variation > normal, then Legendary traits (e.g. Upper Hand, Power Rewind 2),
// then Skill+Activity, then Skill, then how many trait slots are filled
const legendaryTraitCount = (sp) => (sp.t1 && (traits.LEGENDARY_KEYS.has(sp.t1) || (sp.t1 === "power_rewind" && sp.t1_level >= 2)) ? 1 : 0) + (sp.t2 && traits.LEGENDARY_KEYS.has(sp.t2) ? 1 : 0);
const traitCount = (sp) => (sp.t1 ? 1 : 0) + (sp.t2 ? 1 : 0) + (sp.t3 ? 1 : 0);
function specimenOrder(specs, dev) {
  const rank = { skin: 2, variation: 1, base: 0 };
  const kindOf = (sp) => (sp.variant ? (dev?.variants.find((v) => v.name === sp.variant)?.kind || "variation") : "base");
  return specs.slice().sort((a, b) => rank[kindOf(b)] - rank[kindOf(a)] || legendaryTraitCount(b) - legendaryTraitCount(a)
    || (b.power + b.mood) - (a.power + a.mood) || b.power - a.power || traitCount(b) - traitCount(a) || b.id - a.id);
}
function featuredSpecimen(specs, dev) {
  return specs.length ? specimenOrder(specs, dev)[0] : null;
}

// A variant always carries its own trait (from the wiki's Deviation Trait Page). When the wiki adds one
// later (e.g. Infrasonic Illusion), give it to every specimen of that variant already caught — without
// replacing a Legendary trait. Safe to run any time; returns how many specimens changed.
function backfillVariantTraits() {
  let n = 0;
  db.tx(() => {
    for (const sp of db.q.variantSpecimens.all()) {
      const dev = data.get(sp.deviation);
      if (!dev) continue;
      const own = traits.variantTraits(dev.name, sp.variant, dev.variants.map((v) => v.name), dev.category);
      const next = { id: sp.id, t1: sp.t1, t1_level: sp.t1_level, t2: sp.t2 };
      if (own[1] && sp.t1 !== own[1] && !traits.LEGENDARY_KEYS.has(sp.t1) && !(sp.t1 === "power_rewind" && sp.t1_level === 2)) { next.t1 = own[1]; next.t1_level = null; }
      if (own[2] && sp.t2 !== own[2] && !traits.LEGENDARY_KEYS.has(sp.t2)) next.t2 = own[2];
      if (next.t1 !== sp.t1 || next.t2 !== sp.t2) { db.q.setVariantTraits.run(next); n++; }
    }
  })();
  return n;
}

// Specimens rolled before the no-repeat rule could have the same trait in slot 3 as in slot 1/2 (crafting
// Eureka Moment is listed for slots 2 and 3): give them a different slot 3 trait (B 2026-10-08).
function fixDuplicateTraits() {
  let n = 0;
  db.tx(() => {
    for (const sp of db.q.slot3Specimens.all()) {
      const dev = data.get(sp.deviation);
      if (!dev) continue;
      const taken = new Set([traits.nameOf(1, sp.t1, dev.category), traits.nameOf(2, sp.t2, dev.category)].filter(Boolean));
      if (!taken.has(traits.nameOf(3, sp.t3, dev.category))) continue;
      const pool = traits.allowed(dev.name, dev.category).slot3.filter((t) => !taken.has(t.name));
      db.q.setT3.run(pool.length ? pool[Math.floor(Math.random() * pool.length)].key : null, sp.id);
      n++;
    }
  })();
  return n;
}

// Destroy one specimen for Starchrom. Only allowed while you own more than one of that deviation,
// so a deviation never leaves your Securement Pods this way.
function destroySpecimen(userId, specimenId) {
  const sp = db.q.getSpecimen.get(Number(specimenId), userId);
  if (!sp) return { ok: false, error: "not_found" };
  if (db.q.countDeviation.get(userId, sp.deviation).n <= 1) return { ok: false, error: "last_one" };
  const row = db.q.getPlayer.get(userId);
  let p, gotUnits = 0;
  db.tx(() => {
    p = loadPlayer(userId, row.login, row.display);
    // the catch still counts as caught (leaderboards, !todaysleader): keep a record of it
    db.raw.prepare(`INSERT INTO scrapped (user_id, deviation, variant, channel, caught_at, scrapped_at) VALUES (?, ?, ?, ?, ?, ?)`).run(userId, sp.deviation, sp.variant, sp.channel, sp.caught_at, Date.now());
    db.q.deleteSpecimen.run(sp.id);
    db.q.decCatch.run(userId, sp.deviation, sp.variant);
    db.q.dropEmptyCatch.run(userId, sp.deviation, sp.variant);
    p.starchrom += ECONOMY.destroyValue;
    gotUnits = Math.min(ECONOMY.destroyUnits, unitRoom(p));
    p.units.standard = (p.units.standard || 0) + gotUnits;
    savePlayer(p);
  })();
  return { ok: true, gained: ECONOMY.destroyValue, units: gotUnits, deviation: sp.deviation, p };
}

// ---------------- hourly free units ----------------
// Once a minute: players with today's !daily who are in a live stream get 1 free Securement
// Unit per hour, and the bot says so in the channel they're in. One message per
// channel, split if it gets long. Nobody else gets hourly units.
function unitNotices(now = Date.now()) {
  if (cfg.PAUSED) return [];
  const byChannel = new Map();
  // self-heal: played in a live stream in the last 15 min but the stream wasn't recorded (e.g. typed right
  // as it went live) -> count them as in that stream
  for (const row of db.q.missingStream.all(now - 15 * 60e3)) {
    const cur = streamOf(row.last_channel);
    if (cur && row.active_stream !== cur) db.q.setActiveStream.run(cur, row.user_id);
  }
  for (const row of db.q.dueHourly.all(now - HOUR)) {
    const ch = row.last_channel;
    if (!ch || !hourlyOn(row) || !db.getChannel(ch)?.enabled) continue;
    const p = loadPlayer(row.user_id, row.login, row.display);
    // away for a while (not in any live stream)? start a fresh hour instead of paying for the gap
    if (now - p.last_unit_at > 2 * HOUR) { p.last_unit_at = now; savePlayer(p); continue; }
    p.last_unit_at += HOUR;
    const got = Math.min(ECONOMY.hourlyUnits, freeRoom(p)); // past the free limit (75 Pods): Starchrom only
    p.units.standard = (p.units.standard || 0) + got;
    p.starchrom += ECONOMY.hourlyStarchrom;
    savePlayer(p);
    if (!byChannel.has(ch)) byChannel.set(ch, []);
    byChannel.get(ch).push({ name: `@${p.display}`, got, units: p.units.standard || 0, starchrom: p.starchrom });
  }
  // one player:  "🎁 @luna acquired an hourly Securement Unit and 15 Starchrom! You now have 8 Securement Units and 1,240 Starchrom. 🎁"
  // several at once: "🎁 Hourly gift (+1 Securement Unit, +15 Starchrom): @luna now 8 units · 1,240 Starchrom | @bob now 3 units · 95 Starchrom 🎁"
  const sc = `${ECONOMY.hourlyStarchrom} ${SC}`;
  const unitsTxt = (n) => `${fmt(n)} Securement Unit${n === 1 ? "" : "s"}`;
  const one = (x) => x.got
    ? `🎁 ${x.name} acquired ${x.got === 1 ? "an hourly Securement Unit" : `${x.got} hourly Securement Units`} and ${sc}! You now have ${unitsTxt(x.units)} and ${fmt(x.starchrom)} ${SC}. 🎁`
    : `🎁 ${x.name} acquired an hourly ${sc}! (free units stop at ${ECONOMY.freeUnitCap} Securement Pods — !buy more with ${SC}) You now have ${fmt(x.starchrom)} ${SC}. 🎁`;
  const short = (x) => `${x.name} now ${fmt(x.units)} unit${x.units === 1 ? "" : "s"} · ${fmt(x.starchrom)} ${SC}${x.got ? "" : ` (${ECONOMY.freeUnitCap}+ pods, no free unit)`}`;
  const head = `🎁 Hourly gift (+${ECONOMY.hourlyUnits} Securement Unit, +${sc}): `;
  const out = [];
  for (const [ch, list] of byChannel) {
    if (list.length === 1) { out.push([ch, one(list[0])]); continue; }
    let batch = [];
    const flush = () => { out.push([ch, batch.length === 1 ? one(batch[0]) : head + batch.map(short).join(" | ") + " 🎁"]); batch = []; };
    for (const x of list) {
      if (batch.length && (head + [...batch, x].map(short).join(" | ") + " 🎁").length > 450) flush();
      batch.push(x);
    }
    if (batch.length) flush();
  }
  return out; // [[channelId, message], ...]
}

function inventory(userId, login, display) {
  const p = loadPlayer(userId, login, display);
  return `@${display} ${unitsText(p)} · next free unit: ${nextUnitIn(p)}`;
}

// !starchrom — just your balance
function starchromText(userId, login, display) {
  const p = loadPlayer(userId, login, display);
  return `@${display} 💠 you have ${fmt(p.starchrom)} ${SC}. Throws cost ${ECONOMY.throwCost} each — !shop to spend it, !daily for +${ECONOMY.daily.starchrom}.`;
}

function collectionSummary(userId) {
  const rows = db.q.listCatches.all(userId);
  const species = new Set(rows.map((r) => r.deviation));
  const variants = rows.filter((r) => r.variant).length;
  const skins = rows.filter((r) => r.variant && r.kind === "skin").length;
  const variations = variants - skins;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return { rows, species: species.size, variants, variations, skins, total };
}

function dex(userId, login, display, baseUrl) {
  loadPlayer(userId, login, display);
  const c = collectionSummary(userId);
  const all = data.all();
  const totalOf = (kind) => all.reduce((s, d) => s + d.variants.filter((v) => v.kind === kind).length, 0);
  if (!c.total) return `@${display} your Securement Pods are empty — wait for a deviation to show up and type !secure! Collection page: ${baseUrl}/u/${login}`;
  return `@${display} 📖 Securement Pods: ${c.species}/${all.length} deviations, ${c.variations}/${totalOf("variation")} variations, ${c.skins}/${totalOf("skin")} skins, ${c.total} secured in total. ${baseUrl}/u/${login}`;
}


function info(query, baseUrl) {
  const d = data.find(query);
  if (!d) return null;
  const tier = TIERS[d.rarity].label;
  const drops = d.drops.filter((x) => !/:\s*(N\/A|None|TBD)\s*$/i.test(x)).join("; ");
  const extra = d.variants.length ? ` ${d.variants.length} variants/skins to collect.` : "";
  const fn = d.fn ? ` ${d.fn.replace(/\.$/, "")}.` : "";
  return `${d.name}${fn}${drops ? ` Drops: ${drops}.` : ""}${extra} ${cfg.WIKI_BASE}/Deviation_Main_Page`;
}

// !traits [deviation] — your best specimen of that deviation, or your latest catch
function specimenText(userId, login, display, query, baseUrl) {
  loadPlayer(userId, login, display);
  let sp, dev;
  if (query) {
    dev = data.find(query);
    if (!dev) return `@${display} no deviation matches "${query}".`;
    sp = featuredSpecimen(db.q.specimensOf.all(userId, dev.id), dev); // same one the card features
    if (!sp) return `@${display} you haven't secured a ${dev.name} yet.`;
  } else {
    sp = db.q.latestSpecimen.get(userId);
    if (!sp) return `@${display} you haven't secured anything yet — type !secure when a deviation shows up!`;
    dev = data.get(sp.deviation);
  }
  const count = db.q.specimensOf.all(userId, sp.deviation).length;
  const nm = `${dev?.name || sp.deviation}${sp.variant ? ` — ${sp.variant}` : ""}`;
  const label = query ? `best ${nm}${count > 1 ? ` (of ${count})` : ""}` : `latest: ${nm}`;
  return `@${display} ${label} · ${ratingTag(sp)} · ${traits.shortTraits(sp, dev?.category)} ${baseUrl}/u/${login}`;
}

// !todaysleader: who has secured the most deviations in this channel during the current broadcast (B 2026-10-09)
function todaysLeader(bid, startedAt, display) {
  if (!startedAt) return `@${display} the stream isn't live right now — !todaysleader shows who has secured the most deviations during the current stream.`;
  const rows = db.raw.prepare(`SELECT p.display, COUNT(*) AS n FROM (SELECT user_id, channel, caught_at FROM specimens UNION ALL SELECT user_id, channel, caught_at FROM scrapped) s
    JOIN players p ON p.user_id=s.user_id
    WHERE s.channel=? AND s.caught_at>=? GROUP BY s.user_id ORDER BY n DESC, MIN(s.caught_at) ASC LIMIT 5`).all(bid, startedAt);
  if (!rows.length) return `@${display} nobody has secured a deviation this stream yet — be the first with !secure!`;
  const medal = ["🥇", "🥈", "🥉", "4.", "5."];
  return `🏆 Today's leader: @${rows[0].display} with ${rows[0].n} deviation${rows[0].n === 1 ? "" : "s"} secured this stream! ${rows.map((r, i) => `${medal[i]} ${r.display} (${r.n})`).join(" · ")}`;
}

function top(baseUrl) {
  const rows = db.leaderboard(5);
  if (!rows.length) return "No one has secured a deviation yet. Be the first!";
  return `🏆 Top Metas: ${rows.map((r, i) => `${i + 1}. ${r.display} ${r.species} dev${r.variants ? ` +${r.variants}✨` : ""}`).join(" · ")} — ${baseUrl}/top`;
}

// One-time make-good for everyone: units used to be spent on every throw. Now a unit only houses a
// caught deviation, so give back one unit per past miss (throws - catches), minus any already refunded.
function refundAllMisses(key, alreadyRefunded = {}) {
  if (db.q.getSetting.get(key)) return null;
  const out = [];
  db.tx(() => {
    for (const row of db.q.allPlayers.all()) {
      const p = loadPlayer(row.user_id);
      const owed = Math.max(0, p.attempts - db.q.countCatchesFor.get(row.user_id).n - (alreadyRefunded[p.login] || 0));
      if (!owed) continue;
      p.units.standard = (p.units.standard || 0) + owed;
      savePlayer(p);
      out.push(`${p.login}+${owed}`);
    }
    db.q.setSetting.run(key, out.join(" ") || "none");
  })();
  return out;
}

module.exports = { freeRoom, todaysLeader, fixDuplicateTraits, rollLegendarySpawn, timerCheck, hourlyCheck, hourly, startHourly, HOURLY_ON_TEXT, specimenOrder, featuredSpecimen, backfillVariantTraits, soupLeftMin, announcePurchase, setAnnouncer, starchromText, unitCap, unitRoom, podsUsed, bestGlove, refundAllMisses, hourlyStatus, setStreamLookup, unitNotices, destroySpecimen, savePlayer, nextUnitIn, specimenText, ratingTag, Spawns, daily, shop, buy, inventory, dex, info, top, collectionSummary, loadPlayer, rollSpawn, catchChance, rewardFor, unitsText };
