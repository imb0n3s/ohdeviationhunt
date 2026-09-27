// traits.js — Deviant Power / Mood ratings and the three trait slots, following the
// wiki's Deviation Trait Page (https://ohwikiguide.com/Deviation_Trait_Page).
//
// The page's own filter rules for a COMBAT deviation are copied exactly:
//   Slot 1: any Global trait, or that deviation's own name-matched Slot 1 trait (slot1ForDev)
//   Slot 2: any generic combat Slot 2 trait, or that deviation's own specific ones (slot2ForDev);
//           another deviation's specific Slot 2 trait is never allowed
//   Slot 3: any combat Slot 3 (fused) trait
// The page data (g_data1, c_data1-3, slot1ForDev, slot2ForDev) is pulled live and refreshed
// with the deviation data; traits-fallback.json is the snapshot if the wiki is unreachable.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cfg = require("./config");

const FALLBACK = path.join(__dirname, "traits-fallback.json");

// Chance a slot rolls the deviation's own special trait instead of a general one
const SPECIFIC_CHANCE = { slot1: 0.15, slot2: 0.2 };
// Deviant Power and Mood ratings 1-5: higher is rarer
const RATING_WEIGHTS = [30, 28, 22, 13, 7];

let T = null; // { global, slot1, slot2, slot3, slot1ForDev, slot2ForDev }
let source = "none";

function grab(raw, name) {
  const i = raw.indexOf(`var ${name} = `);
  if (i < 0) throw new Error(`${name} not found on trait page`);
  const j = raw.indexOf("=", i) + 1;
  let depth = 0, quote = null, k = j;
  for (; k < raw.length; k++) {
    const c = raw[k];
    if (quote) { if (c === "\\") { k++; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") { depth--; if (depth === 0) break; }
  }
  return vm.runInNewContext(`(${raw.slice(j, k + 1)})`, {}, { timeout: 1000 });
}

// "Cheer Up (1-3)" -> { name: "Cheer Up", maxLevel: 3 }
function toTrait(key, [label, lines]) {
  const m = String(label).match(/^(.*?)\s*\((\d)\s*-\s*(\d)\)\s*$/);
  const fuse = (lines || [])[0]?.startsWith("Fuse:") ? lines[0].slice(5).trim() : null;
  const effects = (lines || []).filter((l) => !l.startsWith("Fuse:") && !l.startsWith("Can be found on:"));
  return { key, name: m ? m[1] : label, minLevel: m ? +m[2] : null, maxLevel: m ? +m[3] : null, effects, fuse };
}

function parse(raw) {
  const obj = (n) => Object.entries(grab(raw, n)).map(([k, v]) => toTrait(k, v));
  const t = {
    global: obj("g_data1"),
    slot1: obj("c_data1"),
    slot2: obj("c_data2"),
    slot3: obj("c_data3"),
    slot1ForDev: grab(raw, "slot1ForDev"),
    slot2ForDev: grab(raw, "slot2ForDev"),
  };
  if (!t.global.length || !t.slot2.length || !t.slot3.length) throw new Error("trait page parsed empty");
  return t;
}

async function refresh() {
  try {
    const res = await fetch(`${cfg.WIKI_BASE}/index.php?title=Deviation_Trait_Page&action=raw`, { headers: { "User-Agent": "OHDeviationHunt/1.0 (+https://ohwikiguide.com)" } });
    if (!res.ok) throw new Error(`wiki ${res.status}`);
    T = parse(await res.text());
    source = "wiki";
    try { fs.writeFileSync(FALLBACK, JSON.stringify(T, null, 1)); } catch {}
    console.log(`[traits] ${T.global.length} global, ${T.slot1.length}/${T.slot2.length}/${T.slot3.length} combat slot traits from the wiki`);
  } catch (e) {
    console.error("[traits] wiki load failed:", e.message);
    if (!T) { T = JSON.parse(fs.readFileSync(FALLBACK, "utf8")); source = "snapshot"; }
  }
}

// ---------- which traits a deviation may have (the page's slotAllows) ----------

function specificSlot2Keys() {
  const s = new Set();
  for (const arr of Object.values(T.slot2ForDev)) for (const k of arr) s.add(k);
  return s;
}

function allowed(devName) {
  const own1 = T.slot1ForDev[devName];
  const own2 = T.slot2ForDev[devName] || [];
  const specific2 = specificSlot2Keys();
  return {
    slot1General: T.global,
    slot1Own: own1 ? T.slot1.filter((t) => t.key === own1) : [],
    slot2General: T.slot2.filter((t) => !specific2.has(t.key)),
    slot2Own: T.slot2.filter((t) => own2.includes(t.key)),
    slot3: T.slot3,
  };
}

// ---------- rolling ----------

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function rating() {
  const total = RATING_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < RATING_WEIGHTS.length; i++) { r -= RATING_WEIGHTS[i]; if (r <= 0) return i + 1; }
  return 5;
}

// A deviation-specific trait may list one effect per variant ("Dr Teddy - Infrasonic Illusion: ...").
// Use the line for this specimen's variant when there is one.
function effectFor(trait, variant) {
  if (!trait.effects.length) return "";
  if (variant) {
    const v = variant.toLowerCase();
    const hit = trait.effects.find((l) => l.toLowerCase().includes(v));
    if (hit) return hit;
  }
  return pick(trait.effects);
}

function rollSpecimen(devName, variant) {
  const a = allowed(devName);
  const s1 = a.slot1Own.length && Math.random() < SPECIFIC_CHANCE.slot1 ? pick(a.slot1Own) : pick(a.slot1General);
  const s2 = a.slot2Own.length && Math.random() < SPECIFIC_CHANCE.slot2 ? pick(a.slot2Own) : pick(a.slot2General);
  const s3 = pick(a.slot3);
  const lvl = s1.maxLevel ? s1.minLevel + Math.floor(Math.random() * (s1.maxLevel - s1.minLevel + 1)) : null;
  return {
    power: rating(),
    mood: rating(),
    t1: s1.key, t1_level: lvl,
    t2: s2.key,
    t3: s3.key,
  };
}

// ---------- display ----------

function find(slot, key) {
  if (!T || !key) return null;
  if (slot === 1) return T.global.find((t) => t.key === key) || T.slot1.find((t) => t.key === key);
  return (slot === 2 ? T.slot2 : T.slot3).find((t) => t.key === key) || null;
}

function traitName(slot, key, level) {
  const t = find(slot, key);
  if (!t) return key || "—";
  return level ? `${t.name} ${level}` : t.name;
}

function traitEffect(slot, key, level, variant) {
  const t = find(slot, key);
  if (!t) return "";
  if (slot === 1 && level && t.maxLevel) return (t.effects[level - 1] || "").replace(/^\d+\s+/, "");
  return effectFor(t, variant);
}

const shortTraits = (s) => `${traitName(1, s.t1, s.t1_level)} | ${traitName(2, s.t2)} | ${traitName(3, s.t3)}`;

module.exports = { refresh, parse, allowed, rollSpecimen, traitName, traitEffect, shortTraits, info: () => ({ source, loaded: !!T }), RATING_WEIGHTS };
