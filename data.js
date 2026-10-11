// data.js — every deviation (combat, crafting, territory), pulled live from the wiki's Deviation Main Page.
//
// The page keeps its data in JS objects (combatData, craftingData, territoryData, deviationVariations, deviationSkins).
// We fetch the raw wikitext, cut those objects out and evaluate them in a sandbox.
// Refreshes every few hours, so anything added to the wiki joins the game automatically.
// If the wiki is unreachable we fall back to the snapshot in combat-fallback.json.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cfg = require("./config");
const { rarityOf } = require("./rarity");

const FALLBACK = path.join(__dirname, "combat-fallback.json");
const REFRESH_MS = 6 * 60 * 60 * 1000;

let deviations = []; // [{ id, name, rarity, img, fn, drops[], variants:[{ name, kind:'variation'|'skin', img }] }]
let loadedAt = 0;
let source = "none";

function grabObject(raw, name) {
  const i = raw.indexOf(`const ${name} = `);
  if (i < 0) throw new Error(`${name} not found on page`);
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

const strip = (s) => String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

const CATEGORIES = { combat: "combatData", crafting: "craftingData", territory: "territoryData" };

function parse(raw) {
  const all = [];
  for (const [category, objName] of Object.entries(CATEGORIES)) all.push(...parseCategory(raw, objName, category));
  if (all.length < 5) throw new Error(`only ${all.length} deviations parsed`);
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

function parseCategory(raw, objName, category) {
  const combat = grabObject(raw, objName);
  let vars = {}, skins = {};
  try { vars = grabObject(raw, "deviationVariations"); } catch {}
  try { skins = grabObject(raw, "deviationSkins"); } catch {}
  const out = [];
  for (const [id, v] of Object.entries(combat)) {
    const joined = (v.lines || []).join(" ");
    const img = (joined.match(/src=['"]([^'"]+)['"]/) || [])[1] || null;
    const lines = (v.lines || []).map(strip).filter(Boolean);
    const fnLine = lines.find((l) => l.startsWith("Function:"));
    const drops = [];
    let inDrops = false;
    for (const l of lines) {
      if (/^Drops From:/.test(l)) { inDrops = true; continue; }
      if (/^(Variations|Notes|Attacks|Securement Environment|Function)\b/.test(l)) inDrops = false;
      if (inDrops) drops.push(l);
    }
    const variants = [
      ...(vars[v.title] || []).map((x) => ({ name: x.n, kind: "variation", img: x.u })),
      ...(skins[v.title] || []).map((x) => ({ name: x.n, kind: "skin", img: x.u })),
    ];
    out.push({ id: slug(v.title) || id, name: v.title, category, rarity: rarityOf(v.title), img, fn: fnLine ? fnLine.replace(/^Function:\s*/, "") : "", drops, variants });
  }
  return out;
}

async function refresh() {
  try {
    // follows wiki redirects (the page moved from Deviation_Main_Page to Deviation, 2026-10)
    let title = cfg.DEVIATION_PAGE, text = "";
    for (let hop = 0; hop < 3; hop++) {
      const url = `${cfg.WIKI_BASE}/index.php?title=${encodeURIComponent(title)}&action=raw`;
      const res = await fetch(url, { headers: { "User-Agent": "OHDeviationHunt/1.0 (+https://ohwikiguide.com)" } });
      if (!res.ok) throw new Error(`wiki ${res.status}`);
      text = await res.text();
      const r = text.match(/^\s*#REDIRECT\s*\[\[([^\]|#]+)/i);
      if (!r) break;
      title = r[1].trim().replace(/ /g, "_");
    }
    deviations = parse(text);
    source = "wiki";
    loadedAt = Date.now();
    try { fs.writeFileSync(FALLBACK, JSON.stringify(deviations, null, 1)); } catch {}
    console.log(`[data] ${deviations.length} deviations from the wiki`);
  } catch (e) {
    console.error("[data] wiki load failed:", e.message);
    if (!deviations.length) {
      deviations = JSON.parse(fs.readFileSync(FALLBACK, "utf8")).map((d) => ({ ...d, rarity: rarityOf(d.name) }));
      source = "snapshot";
      loadedAt = Date.now();
      console.log(`[data] using snapshot: ${deviations.length} deviations`);
    }
  }
}

function start() {
  const p = refresh();
  setInterval(refresh, REFRESH_MS).unref();
  return p;
}

// Fuzzy lookup by name: "teddy" -> Dr. Teddy, "lonewolf" -> Lonewolf Whisper
function find(q) {
  const s = slug(q);
  if (!s) return null;
  return deviations.find((d) => d.id === s) || deviations.find((d) => d.id.startsWith(s)) || deviations.find((d) => d.id.includes(s)) || null;
}

// "nutcracker infrasonic illusion" -> { dev: Nutcracker, variant: Infrasonic Illusion }. Tolerates small typos in the
// variant name ("infransonic"); "<deviation> skin" / "<deviation> variation" picks a random one of that kind.
// Returns { dev, variant } | { dev, error, options } | null (no deviation found).
function lev(a, b) {
  const m = a.length, n = b.length, dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
function findWithVariant(q) {
  const words = String(q || "").trim().split(/\s+/).filter(Boolean);
  for (let i = words.length; i >= 1; i--) {
    const dev = find(words.slice(0, i).join(" "));
    if (!dev) continue;
    const rest = words.slice(i).join(" ");
    if (!rest) return { dev, variant: null };
    const r = slug(rest);
    if (r === "skin" || r === "skins" || r === "variation" || r === "variations" || r === "variant") {
      const kind = r.startsWith("skin") ? "skin" : "variation";
      const list = dev.variants.filter((v) => v.kind === kind && !/chaos/i.test(v.name));
      return list.length ? { dev, variant: list[Math.floor(Math.random() * list.length)] } : { dev, error: `${dev.name} has no ${kind}s` };
    }
    const vs = dev.variants.map((v) => ({ v, s: slug(v.name) }));
    const hit = vs.find((x) => x.s === r) || vs.find((x) => x.s.startsWith(r)) || vs.find((x) => x.s.includes(r))
      || vs.map((x) => ({ ...x, d: lev(x.s, r) })).filter((x) => x.d <= Math.max(2, Math.floor(r.length / 6))).sort((a, b) => a.d - b.d)[0];
    if (hit) return { dev, variant: hit.v };
    return { dev, error: `${dev.name} has no variation or skin called "${rest}"`, options: dev.variants.map((v) => v.name) };
  }
  return null;
}

module.exports = {
  start, refresh, find, findWithVariant, parse, slug,
  all: () => deviations,
  get: (id) => deviations.find((d) => d.id === id),
  info: () => ({ count: deviations.length, source, loadedAt }),
};
