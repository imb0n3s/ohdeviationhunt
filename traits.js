// traits.js — Deviant Power / Mood ratings and the three trait slots, following the
// wiki's Deviation Trait Page (https://ohwikiguide.com/Deviation_Trait_Page).
//
// The page's own filter rules are copied exactly, per category (combat / crafting / territory):
//   Slot 1: any Global trait, or that deviation's own name-matched Slot 1 trait (slot1ForDev)
//   Slot 2: any generic Slot 2 trait of its category, or that deviation's own specific ones (slot2ForDev);
//           another deviation's specific Slot 2 trait is never allowed
//   Slot 3: any Slot 3 (fused) trait of its category
// The page data (g_data1, c_data1-3, slot1ForDev, slot2ForDev) is pulled live and refreshed
// with the deviation data; traits-fallback.json is the snapshot if the wiki is unreachable.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cfg = require("./config");

const FALLBACK = path.join(__dirname, "traits-fallback.json");

// Chance each slot has a trait at all (rolled separately, so a specimen can have 0-3 traits).
// A variation/skin with its own locked trait always has that slot filled.
const SLOT_CHANCE = { 1: 0.6, 2: 0.5, 3: 0.4 };
// Chance a slot rolls the deviation's own special trait instead of a general one
const SPECIFIC_CHANCE = { slot1: 0.15, slot2: 0.2 };
// Deviant Power and Mood ratings 1-5: higher is rarer
const RATING_WEIGHTS = [30, 28, 22, 13, 7];

// Legendary traits: never in the normal trait rolls. A spawn secretly carries one 1 in 400 times
// (not announced); everyone who secures that spawn gets it. Power Rewind is Legendary at level 2
// only — level 1 still rolls normally.
const LEGENDARY_CHANCE = 1 / 400;
const LEGENDARY = {
  slot1: [{ key: "power_rewind", level: 2 }, { key: "upper_hand" }],
  slot2: ["crack_shot", "psychic_kid", "come_as_one", "world_charm", "anti_burnout", "devoted_laborer", "dream_wild",
          "hydrophilic", "living_map", "panovision", "sweet_talk", "water_dormancy"],
};
const LEGENDARY_KEYS = new Set([...LEGENDARY.slot1.filter((x) => !x.level).map((x) => x.key), ...LEGENDARY.slot2]);

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

// the page's catMeta: which data objects hold slots 1-3 for each deviation category
const CAT_DATA = { combat: ["c_data1", "c_data2", "c_data3"], crafting: ["cr_data1", "cr_data2", "cr_data3"], territory: ["data1", "data2", "data3"] };

function parse(raw) {
  const obj = (n) => Object.entries(grab(raw, n)).map(([k, v]) => toTrait(k, v));
  const t = { global: obj("g_data1"), cats: {}, slot1ForDev: grab(raw, "slot1ForDev"), slot2ForDev: grab(raw, "slot2ForDev") };
  for (const [cat, [a, b, c]] of Object.entries(CAT_DATA)) {
    t.cats[cat] = { slot1: obj(a), slot2: obj(b), slot3: obj(c) };
    if (!t.cats[cat].slot2.length || !t.cats[cat].slot3.length) throw new Error(`trait page: ${cat} parsed empty`);
  }
  if (!t.global.length) throw new Error("trait page: no global traits");
  return t;
}

async function refresh() {
  try {
    const res = await fetch(`${cfg.WIKI_BASE}/index.php?title=Deviation_Trait_Page&action=raw`, { headers: { "User-Agent": "OHDeviationHunt/1.0 (+https://ohwikiguide.com)" } });
    if (!res.ok) throw new Error(`wiki ${res.status}`);
    T = parse(await res.text());
    source = "wiki";
    try { fs.writeFileSync(FALLBACK, JSON.stringify(T, null, 1)); } catch {}
    console.log(`[traits] ${T.global.length} global + ${Object.entries(T.cats).map(([c, v]) => `${c} ${v.slot1.length}/${v.slot2.length}/${v.slot3.length}`).join(", ")} slot traits from the wiki`);
  } catch (e) {
    console.error("[traits] wiki load failed:", e.message);
    if (!T) { T = JSON.parse(fs.readFileSync(FALLBACK, "utf8")); source = "snapshot"; }
    if (!T.cats) throw new Error("trait snapshot is from an old version");
  }
}

// ---------- which traits a deviation may have (the page's slotAllows) ----------

function specificSlot2Keys() {
  const s = new Set();
  for (const arr of Object.values(T.slot2ForDev)) for (const k of arr) s.add(k);
  return s;
}

const catOf = (cat) => T.cats[cat] || T.cats.combat;

function allowed(devName, cat = "combat") {
  const C = catOf(cat);
  const own1 = T.slot1ForDev[devName];
  const own2 = T.slot2ForDev[devName] || [];
  const specific2 = specificSlot2Keys();
  return {
    slot1General: T.global.filter((t) => !LEGENDARY_KEYS.has(t.key)),
    slot1Own: own1 ? C.slot1.filter((t) => t.key === own1) : [],
    slot2General: C.slot2.filter((t) => !specific2.has(t.key) && !LEGENDARY_KEYS.has(t.key)),
    slot2Own: C.slot2.filter((t) => own2.includes(t.key)),
    slot3: C.slot3,
  };
}

// ---------- variant-locked traits ----------
// A deviation's own trait usually belongs to one of its variations/skins, e.g. Grumpy Bulb's
// Slot 1 trait is "Grumpy Bulb - Violet Robe: It gains Max Energy (Skill) +40%" — only a
// Violet Robe Grumpy Bulb has it. Each such effect line becomes its own option, tied to that
// variant. Own traits that name no variant (e.g. Whalepup's "Don't Get Wet") stay open to all.

const norm = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");

// "Lonewolf's Whisper - Bursting Magma: It gains..." -> "Bursting Magma"
function lineLabel(line) {
  const head = String(line).split(":")[0];
  const parts = head.split(" - ");
  return parts.length > 1 ? parts[parts.length - 1].replace(/\s*\([^)]*\)\s*/g, "").trim() : null;
}

function variantMatches(label, variant) {
  const a = norm(label), b = norm(variant);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

// Own-trait options for one slot: [{ key, label, effect, locked }]
function ownOptions(traitList, variants) {
  const out = [];
  for (const t of traitList) {
    // Slot 2 traits carry the variant in the name ("Weakspot Master - Glistening Blue")
    const nameLabel = t.name.includes(" - ") ? t.name.split(" - ").pop().trim() : null;
    for (const line of t.effects.length ? t.effects : [""]) {
      const label = lineLabel(line) || nameLabel;
      const locked = label && variants.some((v) => variantMatches(label, v)) ? label : null;
      out.push({ key: t.key, label, effect: line, locked });
    }
  }
  return out;
}

// ---------- rolling ----------

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function rating() {
  const total = RATING_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < RATING_WEIGHTS.length; i++) { r -= RATING_WEIGHTS[i]; if (r <= 0) return i + 1; }
  return 5;
}

// variants = every variation/skin name this deviation has (from the Deviation page)
function rollSlot(general, own, variant, chance, slotChance) {
  const mine = variant ? own.filter((o) => o.locked && variantMatches(o.locked, variant)) : [];
  if (mine.length) return pick(mine).key;                       // a variant always carries its own trait
  if (Math.random() >= slotChance) return null;                  // empty slot
  const open = own.filter((o) => !o.locked);                     // own traits not tied to any variant
  if (open.length && Math.random() < chance) return pick(open).key;
  return pick(general).key;
}

// At spawn: 1 in 400 spawns hide a Legendary trait this deviation's type can have. { slot, key, level } or null
function rollLegendary(devName, cat = "combat", force = false) {
  if (!T || (!force && Math.random() >= LEGENDARY_CHANCE)) return null;
  const C = catOf(cat), specific2 = specificSlot2Keys(), own2 = T.slot2ForDev[devName] || [];
  const opts = [
    ...LEGENDARY.slot1.filter((x) => T.global.some((t) => t.key === x.key)).map((x) => ({ slot: 1, key: x.key, level: x.level || null })),
    ...LEGENDARY.slot2.filter((k) => C.slot2.some((t) => t.key === k) && (!specific2.has(k) || own2.includes(k))).map((k) => ({ slot: 2, key: k, level: null })),
  ];
  return opts.length ? pick(opts) : null;
}

function rollSpecimen(devName, variant, variants = [], cat = "combat", legendary = null) {
  const a = allowed(devName, cat);
  let t1 = rollSlot(a.slot1General, ownOptions(a.slot1Own, variants), variant, SPECIFIC_CHANCE.slot1, SLOT_CHANCE[1]);
  let t2 = rollSlot(a.slot2General, ownOptions(a.slot2Own, variants), variant, SPECIFIC_CHANCE.slot2, SLOT_CHANCE[2]);
  const t3 = Math.random() < SLOT_CHANCE[3] ? pick(a.slot3).key : null;
  const g = t1 && T.global.find((t) => t.key === t1);
  let lvl = g?.maxLevel ? g.minLevel + Math.floor(Math.random() * (g.maxLevel - g.minLevel + 1)) : null;
  if (t1 === "power_rewind") lvl = g.minLevel;                  // level 2 is Legendary-only
  if (legendary?.slot === 1) { t1 = legendary.key; lvl = legendary.level; }
  if (legendary?.slot === 2) t2 = legendary.key;
  return { power: rating(), mood: rating(), t1, t1_level: lvl, t2, t3 };
}

// ---------- display ----------

function find(slot, key, cat) {
  if (!T || !key) return null;
  const C = catOf(cat);
  if (slot === 1) return T.global.find((t) => t.key === key) || C.slot1.find((t) => t.key === key);
  return (slot === 2 ? C.slot2 : C.slot3).find((t) => t.key === key) || null;
}

// the effect line of a deviation's own trait that belongs to this specimen's variant
function ownLine(t, variant) {
  if (!variant) return null;
  return t.effects.find((l) => variantMatches(lineLabel(l), variant)) || null;
}

function traitName(slot, key, level, variant, cat) {
  if (!key) return null;                              // empty slot
  const t = find(slot, key, cat);
  if (!t) return key || "—";
  if (level) return `${t.name} ${level}`;
  const line = ownLine(t, variant);
  if (line) return lineLabel(line);                 // e.g. "Violet Robe"
  // an own trait that names no variant, e.g. Whalepup's "Don't Get Wet: While equipped..."
  const first = t.effects[0] || "";
  if (catOf(cat).slot1.includes(t) && first.includes(": ") && !lineLabel(first)) return first.split(":")[0].trim();
  return t.name.includes(" - ") ? t.name.split(" - ").pop().trim() : t.name;
}

function traitEffect(slot, key, level, variant, cat) {
  const t = find(slot, key, cat);
  if (!t) return "";
  if (slot === 1 && level && t.maxLevel) return (t.effects[level - 1] || "").replace(/^\d+\s+/, "");
  const line = ownLine(t, variant) || t.effects[0] || "";
  const named = lineLabel(line) || (catOf(cat).slot1.includes(t) && line.indexOf(": ") > 0 && line.indexOf(": ") < 40);
  return line.includes(": ") && named ? line.slice(line.indexOf(": ") + 2) : line;
}

const shortTraits = (s, cat) => [traitName(1, s.t1, s.t1_level, s.variant, cat), traitName(2, s.t2, null, s.variant, cat), traitName(3, s.t3, null, null, cat)].filter(Boolean).join(" | ") || "none";

module.exports = { refresh, parse, allowed, ownOptions, variantMatches, rollSpecimen, rollLegendary, LEGENDARY_CHANCE, traitName, traitEffect, shortTraits, info: () => ({ source, loaded: !!T }), RATING_WEIGHTS, SLOT_CHANCE };
