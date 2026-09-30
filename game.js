// game.js — the Deviation Hunt rules: players, spawns, securing, shop, daily
const cfg = require("./config");
const db = require("./db");
const data = require("./data");
const traits = require("./traits");
const { TIERS, VARIANT, UNITS, ECONOMY, GLOVES, unitKey, isChaos, variantRule } = require("./rarity");

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
  // older saves had Advanced/Elite/Anomaly units: fold them into plain Securement Units
  for (const k of ["advanced", "elite", "anomaly"]) if (p.units[k]) { p.units.standard = (p.units.standard || 0) + p.units[k]; delete p.units[k]; }
  return p;
}

const HOUR = 3600 * 1000;
// Hourly free units run only while the stream the player did !daily in is still live.
// index.js tells us each live channel's current Twitch stream id.
let streamOf = () => null;
const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: ECONOMY.dailyResetTz });
function dailyToday(userId) { const last = db.q.lastDaily.get(userId)?.at; return !!last && dayKey(last) === dayKey(Date.now()); }
function setStreamLookup(fn) { streamOf = fn; }
let announce = () => {};
function setAnnouncer(fn) { announce = fn; }

// Shop purchases made in the Twitch panel or on the website (not Securement Units) get a shout-out
// in the chat the buyer is playing in right now — the channel of their last game command, only while it's live.
function announcePurchase(userId, item, qty = 1) {
  if (!item || item.id === "unit" || item.kind === "units") return false;
  const row = db.q.getPlayer.get(userId);
  const ch = row?.last_channel;
  if (!ch || !streamOf(ch) || !db.getChannel(ch)?.enabled) return false;
  const what = item.kind === "gloves" ? `${item.name} (+${Math.round((item.bonus || 0) * 100)}% capture on every throw)` : `${qty > 1 ? `${qty}× ` : ""}${item.name}`;
  announce(ch, `🛒 @${row.display} just bought ${what} from the Shop! ${item.kind === "gloves" ? "🧤" : "🎉"}`);
  return true;
}
// Hourly free units run while the player (a) has claimed today's !daily and (b) is in a live
// stream: the channel of their latest game command, during that same broadcast. It's a single
// "current stream", so watching several streams never earns more; switching streams keeps the timer.
const hourlyOn = (p) => dailyToday(p.user_id) && !!p.active_stream && streamOf(p.last_channel) === p.active_stream;

// for the panel: is the hourly timer running, and when does the next free unit land?
function hourlyStatus(p) {
  if (!dailyToday(p.user_id)) return { state: "needs_daily" };
  if (!hourlyOn(p)) return { state: "paused" };
  return { state: "running", at: (p.last_unit_at || Date.now()) + HOUR };
}

function nextUnitIn(p) {
  if (!dailyToday(p.user_id)) return "after !daily";
  if (!hourlyOn(p)) return "in a live stream";
  const ms = (p.last_unit_at || Date.now()) + HOUR - Date.now();
  return `${Math.max(1, Math.ceil(ms / 60000))}m`;
}

function savePlayer(p) {
  db.q.savePlayer.run({ user_id: p.user_id, starchrom: p.starchrom, units: JSON.stringify(p.units), last_daily: p.last_daily, attempts: p.attempts, last_unit_at: p.last_unit_at || Date.now(), gloves: JSON.stringify(p.gloves || []), extra_cap: p.extra_cap || 0 });
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
  return { dev, variant };
}

// "P4·M2", with a star for a perfect 5/5
const ratingTag = (sp) => `${sp.power}/${sp.mood}${sp.power === 5 && sp.mood === 5 ? " ⭐" : ""}`;

function spawnName(s) { return s.variant ? `${s.dev.name} — ${s.variant.name}` : s.dev.name; }

// the best gloves a player owns (null if none)
const unitCap = (p) => shopCatalog.unitCap(p);
const podsUsed = (p) => shopCatalog.podsUsed(p);
const unitRoom = (p) => Math.max(0, unitCap(p) - podsUsed(p));

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

function spawnAnnouncement(s) {
  const v = !s.variant ? ""
    : isChaos(s.variant) ? ` 🌀✨ ULTRA-RARE LEGENDARY CHAOS VARIATION! (1 in ${Math.round(1 / VARIANT.chaos.chance)} spawns, ${VARIANT.chaos.catch * 100}% capture)`
    : ` ✨ LEGENDARY ${VARIANT[s.variant.kind].label.toUpperCase()}: ${s.variant.name}!`;
  return `👀 A ${s.dev.name} has been spotted in the wild!${v} Type !secure within ${cfg.SPAWN_WINDOW_SECONDS}s to catch it.`;
}

const RESTORE_GRACE_S = 60; // after a restart, a loose deviation gets at least this long again

// Per-channel spawn state lives in memory; the result goes to SQLite when it resolves
class Spawns {
  constructor(send) {
    this.send = send;              // (broadcasterId, text) => Promise
    this.active = new Map();       // bid -> { dev, variant, endsAt, attempts: Map(userId -> {name, unit}) , timer }
    this.nextAt = new Map();       // bid -> ts of the next spawn
    this.lastChat = new Map();     // bid -> ts of the last viewer message
    this.live = new Set();         // bids currently live
  }

  noteChat(bid) { this.lastChat.set(bid, Date.now()); }

  // ---- persistence: a loose deviation survives restarts/redeploys ----
  persist(bid) {
    const s = this.active.get(bid);
    if (!s) return db.q.deleteActive.run(bid);
    db.q.saveActive.run(bid, JSON.stringify({ dev: s.dev.id, variant: s.variant ? { name: s.variant.name, kind: s.variant.kind } : null, endsAt: s.endsAt, attempts: [...s.attempts], warned: [...s.warned], legendary: s.legendary || null }));
  }

  // called once at startup: bring back loose deviations and finish any that ran out while we were down
  restore() {
    for (const row of db.q.listActive.all()) {
      try {
        const d = JSON.parse(row.data);
        const dev = data.get(d.dev);
        if (!dev) { db.q.deleteActive.run(row.broadcaster_id); continue; }
        const variant = d.variant ? dev.variants.find((v) => v.name === d.variant.name) || d.variant : null;
        const s = { dev, variant, endsAt: d.endsAt, attempts: new Map(d.attempts), warned: new Set(d.warned), legendary: d.legendary || null };
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
          Promise.resolve(this.send(bid, `🔄 The bot just restarted — the ${spawnName(s)} is still loose! If you typed !secure in the last minute, type it again. You have ${left}s.`)).catch(() => {});
        }, 5000);
        s.timer = setTimeout(() => this.resolve(bid).catch((e) => console.error("[resolve]", e)), wait);
        this.active.set(bid, s);
    this.persist(bid);
        console.log(`[spawn] restored ${bid}: ${spawnName(s)}, ${s.attempts.size} throws, resolving in ${Math.round(wait / 1000)}s`);
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

  scheduleNext(bid, fromNow) { this.nextAt.set(bid, Date.now() + (fromNow ?? this.intervalMs(bid))); }

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
      // only spawn if people are actually chatting
      if (now - (this.lastChat.get(bid) || 0) > cfg.ACTIVITY_WINDOW_MIN * 60 * 1000) { this.scheduleNext(bid, 60 * 1000); continue; }
      this.spawn(bid).catch((e) => console.error(`[spawn] ${bid} failed:`, e.message));
    }
  }

  // pick: optional deviation (from !hunt spawn <name>) — spawns that one, no variant
  async spawn(bid, forced, pick = null) {
    if (cfg.PAUSED) return { error: "paused" };
    if (this.active.has(bid)) return { error: "already" };
    const s = pick ? { dev: pick, variant: null } : rollSpawn();
    if (s) s.legendary = traits.rollLegendary(s.dev.name, s.dev.category); // hidden 1-in-400 Legendary trait, never announced
    if (!s) return { error: "nodata" };
    s.attempts = new Map();
    s.warned = new Set();
    s.endsAt = Date.now() + cfg.SPAWN_WINDOW_SECONDS * 1000;
    s.timer = setTimeout(() => this.resolve(bid).catch((e) => console.error("[resolve]", e)), cfg.SPAWN_WINDOW_SECONDS * 1000);
    this.active.set(bid, s);
    this.persist(bid);
    this.scheduleNext(bid, this.intervalMs(bid) + cfg.SPAWN_WINDOW_SECONDS * 1000);
    console.log(`[spawn] ${bid}: ${spawnName(s)} (${s.dev.rarity})${forced ? " [forced]" : ""}`);
    await this.send(bid, spawnAnnouncement(s));
    return { spawn: s };
  }

  // A viewer types !secure [unit]. Returns a reply string, or null to stay quiet.
  attempt(bid, userId, login, display, unitWord) {
    const s = this.active.get(bid);
    if (!s) return null; // nothing out right now — stay silent so chat isn't spammed
    // tell each viewer about a problem at most once per spawn
    const warn = (msg) => { if (s.warned.has(userId)) return null; s.warned.add(userId); return msg; };
    if (s.attempts.has(userId)) return warn(`@${display} you already threw at this ${spawnName(s)} — one throw per deviation. Wait and see if you secured it!`);
    const unit = "standard";
    const p = loadPlayer(userId, login, display);
    if (p.starchrom < ECONOMY.throwCost) {
      return warn(`@${display} a throw costs ${ECONOMY.throwCost} ${SC} and you have ${fmt(p.starchrom)}. ${dailyReady(userId) ? "Claim !daily for +" + ECONOMY.daily.starchrom + " " + SC + "." : "Catching deviations earns more."}`);
    }
    if (!(p.units.standard > 0)) {
      return warn(`@${display} you have no empty Securement Unit to house a deviation. ${hourlyOn(p) ? `Your next free one arrives in ${nextUnitIn(p)}` : dailyReady(userId) ? "Claim !daily for 1 now plus 1 free every hour while this stream is live" : `Your !daily resets at midnight Central (in ${untilReset()})`}, or !buy <amount> for ${fmt(UNITS.standard.price)} ${SC} each (you have ${fmt(p.starchrom)}).`);
    }
    p.starchrom -= ECONOMY.throwCost;
    db.addSpent(ECONOMY.throwCost);
    p.units[unit] -= 1; // held for this spawn: kept if you catch it (the deviation lives in it), returned if it breaks free
    p.attempts += 1;
    savePlayer(p);
    const glove = bestGlove(p);
    s.attempts.set(userId, { login, display, unit, isNew: p.isNew, bonus: glove ? glove.bonus : 0 });
    this.persist(bid);
    const left = p.units[unit];
    const throwTxt = `🎯 Threw at the ${spawnName(s)} (−${ECONOMY.throwCost} ${SC}, Left: ${fmt(p.starchrom)}). You'll have ${left} Securement Pod${left === 1 ? "" : "s"} left if you capture it.${glove ? ` 🧤 ${glove.name} +${Math.round(glove.bonus * 100)}%` : ""}`;
    if (p.isNew) return `@${display} welcome, Meta! You started with ${ECONOMY.starterUnits.standard} Securement Units and ${ECONOMY.starterStarchrom} ${SC}. ${throwTxt} Type !daily for more, plus 1 free unit every hour this stream.`;
    return `@${display} ${throwTxt}`;
  }

  async resolve(bid) {
    const s = this.active.get(bid);
    if (!s) return;
    this.active.delete(bid);
    db.q.deleteActive.run(bid);
    clearTimeout(s.timer);
    const name = spawnName(s);
    if (!s.attempts.size) {
      db.logSpawn(bid, s.dev.id, s.variant?.name, 0, 0);
      db.bumpChannel(bid, 0);
      return this.send(bid, `💨 ${name} slipped away. Nobody tried to secure it...`);
    }
    const caught = [], escaped = [], firsts = [];
    const reward = rewardFor(s);
    db.tx(() => {
      for (const [userId, a] of s.attempts) {
        const p = loadPlayer(userId, a.login, a.display);
        if (Math.random() < catchChance(s, a.unit, a.bonus || 0)) {
          const variant = s.variant?.name || "";
          const had = db.q.getCatch.get(userId, s.dev.id, variant);
          db.q.addCatch.run(userId, s.dev.id, variant, s.variant?.kind || "base", Date.now(), bid);
          const sp = traits.rollSpecimen(s.dev.name, variant, s.dev.variants.map((v) => v.name), s.dev.category, s.legendary);
          db.q.addSpecimen.run({ user_id: userId, deviation: s.dev.id, variant, ...sp, caught_at: Date.now(), channel: bid });
          p.starchrom += reward + (had ? 0 : ECONOMY.newSpeciesBonus);
          if (!had) firsts.push(a.display);
          caught.push(`a ${ratingTag(sp)} by ${a.display}`);
        } else {
          p.units[a.unit] = (p.units[a.unit] || 0) + 1; // it broke free, so the unit it was going into is still empty
          escaped.push(a.display);
        }
        savePlayer(p);
      }
    })();
    db.logSpawn(bid, s.dev.id, s.variant?.name, s.attempts.size, caught.length);
    db.bumpChannel(bid, caught.length);

    const list = (arr, max = 12) => arr.length > max ? `${arr.slice(0, max).join(", ")} +${arr.length - max} more` : arr.join(", ");
    let msg;
    if (caught.length) {
      msg = `🔒 ${name} secured ${list(caught, 7)}! +${reward} ${SC} each.`;
      if (firsts.length) msg += ` 📖 New entry for ${list(firsts, 8)} (+${ECONOMY.newSpeciesBonus}).`;
      if (escaped.length) msg += ` It broke free from ${list(escaped, 6)}.`;
    } else {
      msg = `💥 ${name} got away from ${list(escaped, 8)}! Better luck next time.`;
    }
    msg += caught.length ? ` | !traits ${s.dev.id} for traits` : ` | !pods to see your collection`;
    return this.send(bid, msg);
  }

  status(bid) {
    const s = this.active.get(bid);
    return s ? { name: spawnName(s), secondsLeft: Math.max(0, Math.round((s.endsAt - Date.now()) / 1000)), attempts: s.attempts.size } : null;
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
  for (const [k, n0] of Object.entries(ECONOMY.daily.units)) { const n = Math.min(n0, unitRoom(p)); if (!n) { got.push(`no Securement Unit (your Securement Pods are full at ${unitCap(p)})`); continue; } p.units[k] = (p.units[k] || 0) + n; got.push(`${n} ${UNITS[k].label}${n === 1 ? "" : "s"}`); }
  p.last_unit_at = Date.now();          // first free hourly unit comes an hour after !daily
  db.tx(() => {
    savePlayer(p);
    db.q.addDaily.run(userId, stream, bid, Date.now());
    db.q.setDailyStream.run(bid, stream, userId);
  })();
  const checkins = db.q.countDaily.get(userId).n;
  return `@${display} ✅ Check-in #${fmt(checkins)}! 📦 Daily supply drop: +${ECONOMY.daily.starchrom} ${SC} and ${got.join(", ")}! For the rest of today you'll also get 1 free Securement Unit every hour while you're in a live stream (one stream at a time — the timer keeps going if you switch). ${bagText(p)}`;
}

function shop() {
  const items = shopCatalog.ITEMS.map((i) => `${i.name}${i.bonus ? ` (+${Math.round(i.bonus * 100)}% catch)` : ""}: ${fmt(i.price)} ${SC}`).join(" · ");
  return `🛒 ${items} — !buy <amount> for units, !buy rustic / bbq / savior for gloves (or use the Securement Pods panel's Shop tab). You wear one pair at a time: a better pair replaces yours (no refunds, gloves can't be scrapped).`;
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
  const label = item.kind === "gloves" ? item.name : `${qty} ${item.name}${qty > 1 ? "s" : ""}`;
  if (!r.ok) return `@${display} ${label} ${qty > 1 || item.kind === "gloves" ? "cost" : "costs"} ${fmt(item.price * qty)} ${SC} but you have ${fmt(p.starchrom)}. Earn more by securing deviations and !daily, or scrap extras in the Securement Pods panel.`;
  savePlayer(p);
  if (item.kind === "gloves") {
    const old = r.replaced ? ` They replace your ${r.replaced.name}.` : "";
    return `@${display} 🧤 bought ${item.name} for ${fmt(r.cost)} ${SC}! +${Math.round(item.bonus * 100)}% catch chance on every throw from now on.${old} You have ${fmt(p.starchrom)} ${SC} left.`;
  }
  return `@${display} bought ${label} for ${fmt(r.cost)} ${SC} — you now have ${p.units.standard || 0} Securement Units (${podsUsed(p)}/${unitCap(p)} Securement Pods used). ${bagText(p)}`;
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
  for (const row of db.q.dueHourly.all(now - HOUR)) {
    const ch = row.last_channel;
    if (!ch || !hourlyOn(row) || !db.getChannel(ch)?.enabled) continue;
    const p = loadPlayer(row.user_id, row.login, row.display);
    // away for a while (not in any live stream)? start a fresh hour instead of paying for the gap
    if (now - p.last_unit_at > 2 * HOUR) { p.last_unit_at = now; savePlayer(p); continue; }
    p.last_unit_at += HOUR;
    const got = Math.min(ECONOMY.hourlyUnits, unitRoom(p)); // full at the cap: Starchrom only
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
    : `🎁 ${x.name} acquired an hourly ${sc}! (Securement Pods full, so no unit) You now have ${fmt(x.starchrom)} ${SC}. 🎁`;
  const short = (x) => `${x.name} now ${fmt(x.units)} unit${x.units === 1 ? "" : "s"} · ${fmt(x.starchrom)} ${SC}${x.got ? "" : " (pods full, no unit)"}`;
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
    sp = db.q.specimensOf.get(userId, dev.id);
    if (!sp) return `@${display} you haven't secured a ${dev.name} yet.`;
  } else {
    sp = db.q.latestSpecimen.get(userId);
    if (!sp) return `@${display} you haven't secured anything yet — type !secure when a deviation shows up!`;
    dev = data.get(sp.deviation);
  }
  const count = db.q.specimensOf.all(userId, sp.deviation).length;
  const nm = `${dev?.name || sp.deviation}${sp.variant ? ` — ${sp.variant}` : ""}`;
  const label = query ? `best ${nm}${count > 1 ? ` (of ${count})` : ""}` : `latest: ${nm}`;
  return `@${display} ${label} · ${ratingTag(sp)} · Traits: ${traits.shortTraits(sp, dev?.category)} ${baseUrl}/u/${login}`;
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

module.exports = { announcePurchase, setAnnouncer, starchromText, unitCap, unitRoom, podsUsed, bestGlove, refundAllMisses, hourlyStatus, setStreamLookup, unitNotices, destroySpecimen, savePlayer, nextUnitIn, specimenText, ratingTag, Spawns, daily, shop, buy, inventory, dex, info, top, collectionSummary, loadPlayer, rollSpawn, catchChance, rewardFor, unitsText };
