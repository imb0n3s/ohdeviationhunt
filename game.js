// game.js — the Deviation Hunt rules: players, spawns, securing, shop, daily, scrap
const cfg = require("./config");
const db = require("./db");
const data = require("./data");
const traits = require("./traits");
const { TIERS, VARIANT, UNITS, ECONOMY, unitKey } = require("./rarity");

const SC = "Starchrom";
const fmt = (n) => Number(n).toLocaleString("en-US");

// ---------------- players ----------------

function loadPlayer(userId, login, display) {
  let p = db.q.getPlayer.get(userId);
  if (!p) {
    db.q.insertPlayer.run(userId, login, display, ECONOMY.starterStarchrom, JSON.stringify(ECONOMY.starterUnits), Date.now());
    p = db.q.getPlayer.get(userId);
    p.isNew = true;
  } else if (login && (p.login !== login || p.display !== display)) {
    db.q.touchPlayer.run(login, display, userId);
    p.login = login; p.display = display;
  }
  p.units = JSON.parse(p.units || "{}");
  return p;
}

function savePlayer(p) {
  db.q.savePlayer.run({ user_id: p.user_id, starchrom: p.starchrom, units: JSON.stringify(p.units), last_daily: p.last_daily, attempts: p.attempts });
}

function unitsText(p) {
  const parts = Object.entries(UNITS).map(([k, u]) => `${u.label.replace(" Unit", "")} ${p.units[k] || 0}`);
  return `${fmt(p.starchrom)} ${SC} | Units: ${parts.join(", ")}`;
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
  const tiersPresent = Object.keys(TIERS).filter((t) => all.some((d) => d.rarity === t));
  const tier = weightedPick(tiersPresent, (t) => TIERS[t].weight);
  const pool = all.filter((d) => d.rarity === tier);
  const dev = pool[Math.floor(Math.random() * pool.length)];
  let variant = null;
  const skins = dev.variants.filter((v) => v.kind === "skin");
  const vars = dev.variants.filter((v) => v.kind === "variation");
  const r = Math.random();
  if (skins.length && r < VARIANT.skin.chance) variant = skins[Math.floor(Math.random() * skins.length)];
  else if (vars.length && r < VARIANT.skin.chance + VARIANT.variation.chance) variant = vars[Math.floor(Math.random() * vars.length)];
  return { dev, variant };
}

// "P4·M2", with a star for a perfect 5/5
const ratingTag = (sp) => `Skill ${sp.power}/5 · Activity ${sp.mood}/5${sp.power === 5 && sp.mood === 5 ? " ⭐" : ""}`;

function spawnName(s) { return s.variant ? `${s.dev.name} — ${s.variant.name}` : s.dev.name; }

function catchChance(s, unit) {
  if (unit === "anomaly") return 1;
  let c = TIERS[s.dev.rarity].catch * UNITS[unit].mult;
  if (s.variant) c *= VARIANT[s.variant.kind].catchMult;
  return Math.min(ECONOMY.maxCatchChance, c);
}

function rewardFor(s) {
  let r = TIERS[s.dev.rarity].reward;
  if (s.variant) r *= VARIANT[s.variant.kind].rewardMult;
  return r;
}

function spawnAnnouncement(s) {
  const v = s.variant ? ` ✨ ${VARIANT[s.variant.kind].label.toUpperCase()}: ${s.variant.name}!` : "";
  return `⚠️ A wild ${s.dev.name} has breached containment!${v} Type !secure within ${cfg.SPAWN_WINDOW_SECONDS}s to catch it.`;
}

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

  async spawn(bid, forced) {
    if (this.active.has(bid)) return { error: "already" };
    const s = rollSpawn();
    if (!s) return { error: "nodata" };
    s.attempts = new Map();
    s.warned = new Set();
    s.endsAt = Date.now() + cfg.SPAWN_WINDOW_SECONDS * 1000;
    s.timer = setTimeout(() => this.resolve(bid).catch((e) => console.error("[resolve]", e)), cfg.SPAWN_WINDOW_SECONDS * 1000);
    this.active.set(bid, s);
    this.scheduleNext(bid, this.intervalMs(bid) + cfg.SPAWN_WINDOW_SECONDS * 1000);
    console.log(`[spawn] ${bid}: ${spawnName(s)} (${s.dev.rarity})${forced ? " [forced]" : ""}`);
    await this.send(bid, spawnAnnouncement(s));
    return { spawn: s };
  }

  // A viewer types !secure [unit]. Returns a reply string, or null to stay quiet.
  attempt(bid, userId, login, display, unitWord) {
    const s = this.active.get(bid);
    if (!s) return null; // nothing out right now — stay silent so chat isn't spammed
    if (s.attempts.has(userId)) return null;
    // tell each viewer about a problem at most once per breach
    const warn = (msg) => { if (s.warned.has(userId)) return null; s.warned.add(userId); return msg; };
    let unit = unitKey(unitWord);
    if (!unit) return warn(`@${display} unknown unit — use standard, advanced, elite or anomaly.`);
    const p = loadPlayer(userId, login, display);
    if (!(p.units[unit] > 0)) {
      if (!unitWord) {
        // plain !secure: use the cheapest unit they own (never burn an Anomaly Unit by accident),
        // or quietly buy one Standard Unit if they can afford it
        const owned = ["standard", "advanced", "elite"].find((k) => p.units[k] > 0);
        if (owned) unit = owned;
        else if (p.starchrom >= UNITS.standard.price) { p.starchrom -= UNITS.standard.price; p.units.standard = (p.units.standard || 0) + 1; unit = "standard"; }
      }
      if (!(p.units[unit] > 0)) {
        return warn(`@${display} you're out of ${UNITS[unit].label}s. ${unit === "standard" ? "Grab free ones with !daily or " : ""}!buy ${unit} (${UNITS[unit].price} ${SC} each). You have ${unitsText(p)}.`);
      }
    }
    p.units[unit] -= 1;
    p.attempts += 1;
    savePlayer(p);
    s.attempts.set(userId, { login, display, unit, isNew: p.isNew });
    return p.isNew ? `@${display} welcome, Meta! You got ${ECONOMY.starterStarchrom} ${SC} + starter Securement Units. Unit thrown — results in a few seconds!` : null;
  }

  async resolve(bid) {
    const s = this.active.get(bid);
    if (!s) return;
    this.active.delete(bid);
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
        if (Math.random() < catchChance(s, a.unit)) {
          const variant = s.variant?.name || "";
          const had = db.q.getCatch.get(userId, s.dev.id, variant);
          db.q.addCatch.run(userId, s.dev.id, variant, s.variant?.kind || "base", Date.now(), bid);
          const sp = traits.rollSpecimen(s.dev.name, variant, s.dev.variants.map((v) => v.name));
          db.q.addSpecimen.run({ user_id: userId, deviation: s.dev.id, variant, ...sp, caught_at: Date.now(), channel: bid });
          p.starchrom += reward + (had ? 0 : ECONOMY.newSpeciesBonus);
          if (!had) firsts.push(a.display);
          caught.push(`${a.display} [${ratingTag(sp)}]`);
        } else {
          p.starchrom += ECONOMY.escapeSalvage;
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
      msg = `🔒 ${name} secured by ${list(caught, 7)}! +${reward} ${SC} each.`;
      if (firsts.length) msg += ` 📖 New entry for ${list(firsts, 8)} (+${ECONOMY.newSpeciesBonus}).`;
      if (escaped.length) msg += ` It broke free from ${list(escaped, 8)}.`;
    } else {
      msg = `💥 ${name} broke free from everyone (${list(escaped)})! Better luck next breach.`;
    }
    msg += caught.length ? ` | !traits ${s.dev.id} for traits` : ` | !dex to see your collection`;
    return this.send(bid, msg);
  }

  status(bid) {
    const s = this.active.get(bid);
    return s ? { name: spawnName(s), secondsLeft: Math.max(0, Math.round((s.endsAt - Date.now()) / 1000)), attempts: s.attempts.size } : null;
  }
}

// ---------------- other commands ----------------

function daily(userId, login, display) {
  const p = loadPlayer(userId, login, display);
  const wait = p.last_daily + ECONOMY.dailyCooldownHours * 3600 * 1000 - Date.now();
  if (wait > 0) {
    const h = Math.floor(wait / 3600000), m = Math.ceil((wait % 3600000) / 60000);
    return `@${display} your daily supply drop is on its way — come back in ${h ? `${h}h ` : ""}${m}m.`;
  }
  p.last_daily = Date.now();
  p.starchrom += ECONOMY.daily.starchrom;
  const got = [];
  for (const [k, n] of Object.entries(ECONOMY.daily.units)) { p.units[k] = (p.units[k] || 0) + n; got.push(`${n} ${UNITS[k].label}s`); }
  savePlayer(p);
  return `@${display} 📦 Daily supply drop: +${ECONOMY.daily.starchrom} ${SC} and ${got.join(", ")}! ${unitsText(p)}`;
}

function shop() {
  return `🛒 Securement Units: ${Object.entries(UNITS).map(([k, u]) => `${k} ${fmt(u.price)} ${SC} (${k === "anomaly" ? "never fails" : `x${u.mult} odds`})`).join(" · ")} — buy with !buy <unit> <amount>`;
}

function buy(userId, login, display, args) {
  const [a, b] = args;
  // accept "!buy 5 advanced" and "!buy advanced 5"
  const qtyWord = /^\d+$/.test(a || "") ? a : b;
  const unitWord = /^\d+$/.test(a || "") ? b : a;
  if (!unitWord) return `@${display} usage: !buy <standard|advanced|elite|anomaly> <amount>`;
  const unit = unitKey(unitWord);
  if (!unit) return `@${display} unknown unit. ${shop()}`;
  const qty = Math.max(1, Math.min(100, parseInt(qtyWord || "1", 10) || 1));
  const p = loadPlayer(userId, login, display);
  const cost = UNITS[unit].price * qty;
  if (p.starchrom < cost) return `@${display} that's ${fmt(cost)} ${SC} but you have ${fmt(p.starchrom)}. Earn more by securing deviations, !daily and !scrap.`;
  p.starchrom -= cost;
  p.units[unit] = (p.units[unit] || 0) + qty;
  savePlayer(p);
  return `@${display} bought ${qty} ${UNITS[unit].label}${qty > 1 ? "s" : ""} for ${fmt(cost)} ${SC}. ${unitsText(p)}`;
}

function inventory(userId, login, display) {
  const p = loadPlayer(userId, login, display);
  return `@${display} ${unitsText(p)}`;
}

function collectionSummary(userId) {
  const rows = db.q.listCatches.all(userId);
  const species = new Set(rows.map((r) => r.deviation));
  const variants = rows.filter((r) => r.variant).length;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return { rows, species: species.size, variants, total };
}

function dex(userId, login, display, baseUrl) {
  loadPlayer(userId, login, display);
  const c = collectionSummary(userId);
  const all = data.all();
  const totalVariants = all.reduce((s, d) => s + d.variants.length, 0);
  if (!c.total) return `@${display} your Deviadex is empty — wait for a breach and type !secure! Collection page: ${baseUrl}/u/${login}`;
  return `@${display} 📖 Deviadex: ${c.species}/${all.length} combat deviations, ${c.variants}/${totalVariants} variants & skins, ${c.total} secured in total. ${baseUrl}/u/${login}`;
}

function scrap(userId, login, display) {
  const p = loadPlayer(userId, login, display);
  let n = 0, gain = 0;
  db.tx(() => {
    for (const r of db.q.dupes.all(userId)) {
      const dev = data.get(r.deviation);
      const variant = dev?.variants.find((v) => v.name === r.variant);
      const each = Math.round(rewardFor({ dev: dev || { rarity: "uncommon" }, variant: r.variant ? variant || { kind: r.kind } : null }) * ECONOMY.scrapValue);
      gain += each * (r.count - 1);
      n += r.count - 1;
      db.q.trimDupe.run(userId, r.deviation, r.variant);
      const extra = db.q.specimensOf.all(userId, r.deviation).filter((x) => x.variant === r.variant).slice(1);
      for (const x of extra) db.q.deleteSpecimen.run(x.id);
    }
    p.starchrom += gain;
    savePlayer(p);
  })();
  if (!n) return `@${display} no duplicates to scrap — you keep one of everything.`;
  return `@${display} ♻️ scrapped ${n} duplicate${n > 1 ? "s" : ""} for ${fmt(gain)} ${SC} (kept your best Skill + Activity Rating of each). ${unitsText(p)}`;
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
    if (!dev) return `@${display} no combat deviation matches "${query}".`;
    sp = db.q.specimensOf.get(userId, dev.id);
    if (!sp) return `@${display} you haven't secured a ${dev.name} yet.`;
  } else {
    sp = db.q.latestSpecimen.get(userId);
    if (!sp) return `@${display} you haven't secured anything yet — type !secure when a deviation breaches!`;
    dev = data.get(sp.deviation);
  }
  const count = db.q.specimensOf.all(userId, sp.deviation).length;
  const nm = `${dev?.name || sp.deviation}${sp.variant ? ` — ${sp.variant}` : ""}`;
  const label = query ? `best ${nm}${count > 1 ? ` (of ${count})` : ""}` : `latest: ${nm}`;
  return `@${display} ${label} · Skill Rating ${sp.power}/5 · Activity Rating ${sp.mood}/5 · Traits: ${traits.shortTraits(sp)} ${baseUrl}/u/${login}`;
}

function top(baseUrl) {
  const rows = db.leaderboard(5);
  if (!rows.length) return "No one has secured a deviation yet. Be the first!";
  return `🏆 Top Metas: ${rows.map((r, i) => `${i + 1}. ${r.display} ${r.species} dev${r.variants ? ` +${r.variants}✨` : ""}`).join(" · ")} — ${baseUrl}/top`;
}

module.exports = { specimenText, ratingTag, Spawns, daily, shop, buy, inventory, dex, scrap, info, top, collectionSummary, loadPlayer, rollSpawn, catchChance, rewardFor, unitsText };
