// web.js — public site: landing + "Add to my channel", collection pages, leaderboard,
// OAuth callback, /setup for the bot account, /admin, /health
const express = require("express");
const shop = require("./shop");
const crypto = require("crypto");
const cfg = require("./config");
const db = require("./db");
const twitch = require("./twitch");
const data = require("./data");
const game = require("./game");
const traits = require("./traits");
const { TIERS, UNITS, VARIANT, ECONOMY } = require("./rarity");

// ---------- signed OAuth state ----------
function sign(d) {
  const body = Buffer.from(JSON.stringify(d)).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", cfg.SESSION_SECRET).update(body).digest("base64url")}`;
}
function verify(state) {
  const [body, mac] = String(state || "").split(".");
  if (!body || !mac) return null;
  const expect = crypto.createHmac("sha256", cfg.SESSION_SECRET).update(body).digest("base64url");
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  const d = JSON.parse(Buffer.from(body, "base64url").toString());
  return Date.now() - d.ts > 10 * 60 * 1000 ? null : d;
}
// signed-in viewer (Twitch login, no permissions) — only used to let players shop from their own page
const SESSION_DAYS = 30;
const sessionCookie = (v, maxAge) => `dh_user=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.BASE_URL.startsWith("https") ? "; Secure" : ""}`;
function viewerOf(req) {
  const [body, mac] = String(getCookie(req, "dh_user") || "").split(".");
  if (!body || !mac) return null;
  const expect = crypto.createHmac("sha256", cfg.SESSION_SECRET).update(body).digest("base64url");
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try { const d = JSON.parse(Buffer.from(body, "base64url").toString()); return d.purpose === "session" && d.exp > Date.now() ? d : null; } catch { return null; }
}
const getCookie = (req, name) => (req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-US");

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#0d1319;--card:#1f2a35;--line:#2a3a4a;--accent:#0ea5e9;--text:#e6edf3;--muted:#9fb0c0;--twitch:#9146ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:40px 16px}
h1{font-size:2.1rem;margin:0 0 .3em;line-height:1.15}h2{font-size:1.2rem;margin:2em 0 .6em;color:var(--accent)}
p{color:var(--muted)}.card{background:var(--card);border-radius:12px;padding:18px 22px;margin:14px 0}
.btn{display:inline-block;padding:13px 24px;border-radius:10px;font-weight:600;text-decoration:none;color:#fff;background:var(--twitch);margin:4px 6px 4px 0}
.btn.secondary{background:transparent;border:1px solid var(--muted);color:var(--text)}.btn:hover{filter:brightness(1.1)}
code,kbd{background:#0b1016;padding:2px 7px;border-radius:5px;color:#c9e7ff;font-size:.93em}
.shopbox{scroll-margin-top:16px}.shophead{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:baseline;margin-bottom:10px}.shophead b{font-size:1.15rem;color:var(--text)}.shophead span{color:var(--text)}
.muted{color:var(--muted);font-size:.9em}.btn.sm{padding:7px 14px;font-size:.9rem;margin:0 4px}
.shopgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.si{display:flex;gap:12px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px}.si img{width:64px;height:64px;object-fit:cover;border-radius:8px;flex:none}
.si.glove{border-color:var(--gc);box-shadow:inset 3px 0 0 var(--gc)}.si.glove .sn{color:var(--gc)}.sb{flex:1;min-width:0}.sn{font-weight:700;color:var(--text)}.sd{color:var(--muted);font-size:.85rem;margin:2px 0 8px}
.rar{font-size:.65rem;font-weight:800;text-transform:uppercase;padding:1px 6px;border-radius:99px;background:var(--gc);color:#0d1319;vertical-align:middle}
.si form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.si input[type=number]{width:64px;padding:7px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text)}
.si button{padding:8px 14px;border-radius:8px;border:0;background:var(--accent);color:#fff;font-weight:700;cursor:pointer}.si button:disabled{background:var(--card);color:var(--muted);cursor:default}.si button.owned{background:transparent;border:1px solid var(--gc);color:var(--gc)}
.note{padding:8px 12px;border-radius:8px;margin-bottom:10px;font-weight:600}.note.ok{background:#14532d;color:#bbf7d0}.note.err{background:#7f1d1d;color:#fecaca}
.cmds{width:100%;border-collapse:collapse}.cmds td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--muted)}.cmds tr:last-child td{border-bottom:0}.cmds td:first-child{white-space:nowrap;width:1%;padding-right:18px}.cmds kbd{white-space:nowrap}
@media(max-width:600px){.cmds td{display:block;border:0;padding:4px 0}.cmds tr{display:block;padding:8px 0;border-bottom:1px solid var(--line)}}
.stats{display:flex;gap:12px;flex-wrap:wrap}.stat{flex:1;min-width:130px;background:var(--card);border-radius:12px;padding:14px;text-align:center;color:var(--muted)}
.stat b{display:block;font-size:1.9rem;color:var(--accent)}
.chat{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.88em;white-space:pre-wrap;color:#dfe8f0;overflow-wrap:anywhere}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.dev{background:var(--card);border-radius:12px;padding:10px;text-align:center;border:2px solid transparent;position:relative}
.dev img{width:100%;aspect-ratio:1;object-fit:contain;display:block}
.dev .n{font-weight:600;font-size:.92rem;margin-top:6px}.dev .t{font-size:.78rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase}
.dev .c{position:absolute;top:8px;right:10px;font-size:.8rem;background:#0b1016;border-radius:99px;padding:1px 8px}
.sp{margin-top:8px;text-align:left;font-size:.78rem}.pm{display:flex;justify-content:center;gap:10px;font-weight:600;color:#fde68a;margin-bottom:4px}
.chans{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin:12px 0}
.chan{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;text-decoration:none;color:var(--text)}
.chan:hover{border-color:var(--accent)}.chan.live{border-color:#ef4444;box-shadow:0 0 0 1px rgba(239,68,68,.35)}
.chan img{width:44px;height:44px;border-radius:50%;flex:none;background:var(--line)}.chan.live img{box-shadow:0 0 0 2px #ef4444}
.ci{min-width:0}.cn{font-weight:700}.cs{color:var(--muted);font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lv{background:#ef4444;color:#fff;font-size:.65rem;font-weight:800;border-radius:4px;padding:1px 5px;vertical-align:middle;margin-left:4px}
h2 .sub{font-size:.8rem;color:var(--muted);font-weight:600;margin-left:6px}
.tr{list-style:none;margin:0;padding:0}.tr li{padding:2px 0;border-top:1px solid var(--line);color:var(--text);cursor:help}.tr li b{display:inline-block;width:16px;color:var(--accent)}.tr li.empty{color:var(--muted);font-style:italic;cursor:default}
.bv{font-size:.7rem;color:var(--muted);text-align:center;margin-top:2px}
.dev.missing img{filter:brightness(0) opacity(.35)}.dev.missing .n{color:var(--muted)}
.vars{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:6px}
.vars span{font-size:.7rem;padding:1px 6px;border-radius:99px;background:#0b1016;color:var(--muted);opacity:.7}
.vars span.have{opacity:1;font-weight:600;color:#fde68a;background:#3b2f0b;box-shadow:0 0 0 1px #fbbf24}
.vars span.have.skin{color:#f5d0fe;background:#4a1d4f;box-shadow:0 0 0 1px #e879f9}
.dev.shiny{border-color:#fbbf24;box-shadow:0 0 14px rgba(251,191,36,.35)}
.dev.shiny.skin{border-color:#e879f9;box-shadow:0 0 14px rgba(232,121,249,.4)}
.dev .vb{position:absolute;top:8px;left:10px;font-size:.75rem;font-weight:700;background:#3b2f0b;color:#fde68a;border-radius:99px;padding:1px 8px}
.dev.skin .vb{background:#4a1d4f;color:#f5d0fe}
.dev .vn{font-size:.75rem;font-weight:700;color:#fde68a;margin-top:2px}.dev.skin .vn{color:#f5d0fe}
table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-weight:600}
.bar{height:8px;background:#0b1016;border-radius:99px;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:var(--accent)}
form.find{display:flex;gap:8px;margin:8px 0}form.find input{flex:1;min-width:0;padding:11px 12px;border-radius:9px;border:1px solid var(--line);background:#0b1016;color:var(--text);font-size:1rem}
form.find button{padding:0 18px;border-radius:9px;border:0;background:var(--accent);color:#fff;font-weight:600}
footer{margin-top:48px;color:var(--muted);font-size:.9em}footer a{color:var(--muted)}a{color:var(--accent)}
nav{display:flex;gap:18px;margin-bottom:24px;flex-wrap:wrap}nav a.me{color:var(--accent);font-weight:700}nav a{color:var(--muted);text-decoration:none;font-weight:600}nav a:hover{color:var(--text)}
</style></head><body><main><nav><a href="/">${esc(cfg.BOT_NAME)}</a><a href="/commands">Commands</a><a href="/dex">All deviations</a><a href="/channels">Channels</a><a href="/top">Leaderboard</a><a href="/me" class="me">My Securement Pods</a><a href="${esc(cfg.WIKI_BASE)}">OHWikiGuide</a></nav>${body}
<footer>Deviation data from <a href="${esc(cfg.WIKI_BASE)}/Deviation_Main_Page">ohwikiguide.com</a> · <a href="${esc(cfg.TERMS_URL)}">Terms</a> · <a href="${esc(cfg.PRIVACY_URL)}">Privacy</a>${cfg.DISCORD_URL ? ` · <a href="${esc(cfg.DISCORD_URL)}">Discord</a>` : ""} · Fan-made, not affiliated with Starry Studio / NetEase.</footer></main></body></html>`;
}
const simple = (title, heading, text, extra = "") => page(title, `<h1>${esc(heading)}</h1><p>${text}</p>${extra}<p><a href="/">&larr; Back</a></p>`);
const CAT_LABEL = { combat: "Combat", crafting: "Crafting", territory: "Territory" };
// one heading + grid per deviation type
const sections = (all, card) => Object.keys(CAT_LABEL).map((c) => {
  const list = all.filter((d) => (d.category || "combat") === c);
  return list.length ? `<h2>${CAT_LABEL[c]} <span style="color:var(--muted);font-weight:400">(${list.length})</span></h2><div class="grid">${list.map(card).join("")}</div>` : "";
}).join("");
const tierTag = (r) => `<div class="t" style="color:${TIERS[r].color}">${TIERS[r].label}</div>`;


// ---------- channels running the game (public list) ----------
const avatars = new Map(); // broadcaster id -> profile image url
let avatarsAt = 0;
async function refreshAvatars() {
  if (Date.now() - avatarsAt < 6 * 3600e3 && db.listEnabledChannels().every((c) => avatars.has(c.broadcaster_id))) return;
  avatarsAt = Date.now();
  try {
    const twitch = require("./twitch");
    const ids = db.listEnabledChannels().map((c) => c.broadcaster_id);
    for (let i = 0; i < ids.length; i += 100) {
      const r = await twitch.helix("GET", `/users?${ids.slice(i, i + 100).map((id) => `id=${id}`).join("&")}`, { as: "app" });
      for (const u of r.data || []) avatars.set(u.id, u.profile_image_url);
    }
  } catch (e) { console.error("[web] avatars:", e.message); }
}

const FEATURED = String(process.env.FEATURED_CHANNEL || "imbon3s").toLowerCase();
function channelList(pool, { limit } = {}) {
  const bot = db.getBotAccount();
  const live = pool?.spawns?.live || new Set(), info = pool?.spawns?.streamInfo || new Map();
  const list = db.listEnabledChannels()
    .filter((c) => c.broadcaster_id !== bot?.user_id)
    .map((c) => ({ ...c, isLive: live.has(c.broadcaster_id), info: info.get(c.broadcaster_id) }))
    // the home channel (FEATURED_CHANNEL, default imbon3s) always leads while it's live
    .sort((a, b) => ((b.isLive && b.login === FEATURED) - (a.isLive && a.login === FEATURED)) || (b.isLive - a.isLive) || ((b.info?.viewers || 0) - (a.info?.viewers || 0)) || b.catches - a.catches || a.display_name.localeCompare(b.display_name));
  const shown = limit ? list.slice(0, limit) : list;
  if (!list.length) return { html: `<p>No channels yet — be the first to add it!</p>`, total: 0, live: 0 };
  const html = `<div class="chans">${shown.map((c) => `<a class="chan${c.isLive ? " live" : ""}" href="https://twitch.tv/${esc(c.login)}" target="_blank" rel="noopener">
<img src="${esc(avatars.get(c.broadcaster_id) || "")}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
<div class="ci"><div class="cn">${esc(c.display_name)}${c.isLive ? ` <span class="lv">LIVE</span>` : ""}</div>
<div class="cs">${fmt(c.catches)} deviation${c.catches === 1 ? "" : "s"} secured here</div></div></a>`).join("")}</div>`;
  return { html, total: list.length, live: list.filter((c) => c.isLive).length };
}

function channelsPage(pool) {
  const c = channelList(pool);
  return page("Channels", `<h1>Where to play</h1>
<p>Every Twitch channel running ${esc(cfg.BOT_NAME)} — ${c.total} channel${c.total === 1 ? "" : "s"}, ${c.live} live right now. Deviations only show up while a channel is live. Your Securement Pods are the same on all of them.</p>
${c.html}
<p style="margin-top:24px">Streamer? <a href="/auth/twitch?action=add">Add ${esc(cfg.BOT_NAME)} to your channel</a>.</p>`);
}

function landing(pool) {
  const bot = db.getBotAccount();
  const botName = bot?.login || "the bot";
  return page(cfg.BOT_NAME, `
<h1>${esc(cfg.BOT_NAME)} — catch Once Human deviations in Twitch chat</h1>
<p>While you're live, deviations show up in the wild in your chat. Viewers throw with <kbd>!secure</kbd> (10 Starchrom a throw) and house what they catch in Securement Units, earn Starchrom, and fill Securement Pods that follow them to every channel running the game. Every deviation, variation and skin comes straight from <a href="${esc(cfg.WIKI_BASE)}/Deviation_Main_Page">the OHWikiGuide Deviation page</a>, so new ones join the game as soon as they're on the wiki.</p>
<div class="card">
  <a class="btn" href="/auth/twitch?action=add">Add ${esc(cfg.BOT_NAME)} to my channel</a><a class="btn secondary" href="/auth/twitch?action=remove">Remove it</a>
  <p style="margin-bottom:0">You log in with Twitch once; the bot only gets permission to read and post in your chat.${bot ? ` Prefer chat? Type <kbd>!join</kbd> in <a href="https://twitch.tv/${esc(bot.login)}">twitch.tv/${esc(bot.login)}</a>.` : ""} Then <kbd>/mod ${esc(botName)}</kbd> so it isn't rate-limited.</p>
</div>
<div class="stats"><div class="stat"><b>${fmt(channelList(pool).total)}</b>channels</div><div class="stat"><b>${fmt(db.countPlayers())}</b>Metas</div><div class="stat"><b>${fmt(db.totalCatches())}</b>deviations secured</div><div class="stat"><b>${data.all().length}</b>deviations</div><div class="stat"><b>${fmt(db.starchromSpent())}</b>Starchrom spent</div></div>

${(() => { const c = channelList(pool, { limit: 12 }); return `<h2>Where to play <span class="sub">${c.live} live · ${c.total} channel${c.total === 1 ? "" : "s"}</span></h2>
<p>Every Twitch channel with ${esc(cfg.BOT_NAME)}. Deviations only show up while a channel is live — your Securement Pods are the same on all of them.</p>
${c.html}${c.total > 12 ? `<p><a href="/channels">See all ${c.total} channels →</a></p>` : ""}`; })()}

<h2>OBS Source</h2>
<div class="card"><p style="margin-top:0">Show the deviation on your stream while it can be caught: its picture, name, variation or skin, and a countdown. It appears when one is spotted and disappears when it's secured or gets away.</p>
<p>Type <kbd>!hunt obs</kbd> in your chat (broadcaster or mods) and the bot replies with your channel's link. In OBS add a <b>Browser</b> source with that link, size <b>600 × 600</b>. Add <code>?demo=1</code> to the end while you position it so you can see it, then remove it.</p></div>

<h2>Find a collection</h2>
<form class="find" action="/u" method="get"><input name="login" placeholder="Twitch username" aria-label="Twitch username"><button>View</button></form>

<h2>What it looks like</h2>
<div class="card chat">${esc(botName)}: 👀 A Lonewolf Whisper has been spotted in the wild! Type !secure within ${cfg.SPAWN_WINDOW_SECONDS}s to catch it.
viewer42: !secure
metabones: !secure
${esc(botName)}: 🔒 Lonewolf Whisper secured by metabones [Skill 4/5 · Activity 2/5]! +40 Starchrom each. 📖 New entry for metabones (+100). | !traits lonewolfwhisper for traits</div>

<h2>Viewer commands</h2>
<div class="card">
<p><kbd>!secure</kbd> — throw a Securement Unit at the loose deviation (one throw per spawn). <kbd>!catch</kbd> works too.</p>
<p><kbd>!units</kbd> — your Starchrom and Units · <kbd>!shop</kbd> — prices · <kbd>!buy 5</kbd> — buy Securement Units</p>
<p><kbd>!daily</kbd> — free supply drop (+${ECONOMY.daily.starchrom} Starchrom and ${ECONOMY.daily.units.standard} Securement Unit), once a day (resets at midnight Central) during a live stream, plus ${ECONOMY.hourlyUnits} free Securement Unit every hour for the rest of the day while you're in a live stream</p>
<p><kbd>!pods</kbd> — your Securement Pods and collection link · <kbd>!pods name</kbd> — someone else's · <kbd>!scrap</kbd> — turn duplicates into Starchrom</p>
<p><kbd>!traits</kbd> — your latest catch's Skill Rating, Activity Rating and traits · <kbd>!traits lonewolf</kbd> — your best Lonewolf Whisper</p>
<p><kbd>!dev behemoth</kbd> — what a deviation does and where it drops · <kbd>!hunttop</kbd> — leaderboard · <kbd>!hunt</kbd> — help</p>
</div>
<h2>Streamer & mod commands</h2>
<div class="card">
<p><kbd>!hunt spawn</kbd> — release one right now · <kbd>!hunt interval 10</kbd> — minutes between spawns (default ${cfg.SPAWN_INTERVAL_MIN}) · <kbd>!hunt off</kbd> / <kbd>!hunt on</kbd> · <kbd>!hunt status</kbd> · <kbd>!hunt leave</kbd></p>
<p>Deviations only appear while your stream is live and someone has chatted in the last ${cfg.ACTIVITY_WINDOW_MIN} minutes.</p>
</div>
<h2>How catching works</h2>
<div class="card"><table><tr><th>Rarity</th><th>Spawn weight</th><th>Capture rate</th><th>Reward</th></tr>
${Object.values(TIERS).map((t) => `<tr><td style="color:${t.color};font-weight:600">${t.label}</td><td>${t.weight}%</td><td>${Math.round(t.catch * 100)}%</td><td>${t.reward} Starchrom</td></tr>`).join("")}
<tr><td style="color:${TIERS.legendary.color};font-weight:600">Skin (Legendary)</td><td>1 in ${Math.round(1 / VARIANT.skin.chance)}</td><td>${Math.round(VARIANT.skin.catch * 100)}%</td><td>${TIERS.legendary.reward} Starchrom</td></tr></table>
<p>Everyone starts with ${ECONOMY.starterUnits.standard} Securement Units. Every <kbd>!secure</kbd> throw costs ${ECONOMY.throwCost} Starchrom, and a Securement Unit is only used when you catch something — that's where the deviation lives. Get more units: <kbd>!daily</kbd> gives ${ECONOMY.daily.units.standard} and turns on ${ECONOMY.hourlyUnits} free every hour for the rest of that live stream, or buy more for ${fmt(UNITS.standard.price)} Starchrom each. About 1 in ${Math.round(1 / VARIANT.variation.chance)} spawns is a <b>Variation</b> (×${VARIANT.variation.rewardMult} reward, a little harder to catch) and 1 in ${Math.round(1 / VARIANT.skin.chance)} is a <b>Skin</b>, which is always Legendary with a ${Math.round(VARIANT.skin.catch * 100)}% capture rate. Every deviation you secure is its own specimen with <b>Skill Rating 1–5</b> and <b>Activity Rating 1–5</b> (5 is rare; a perfect 5/5 gets a ⭐) and three traits rolled by the rules on the wiki's <a href="${esc(cfg.WIKI_BASE)}/Deviation_Trait_Page">Deviation Trait Page</a>: Slot 1 is a Global trait or that deviation's own trait, Slot 2 is a combat, crafting or territory trait matching the deviation's type (deviation-specific ones only on their own deviation, and variant-specific ones like Grumpy Bulb's Violet Robe only on that variant), Slot 3 is a fused trait. <kbd>!scrap</kbd> keeps your best Skill + Activity specimen of each. First time you secure something: +${ECONOMY.newSpeciesBonus} bonus. A throw that misses costs only the ${ECONOMY.throwCost} Starchrom.</p></div>`);
}

function collectionPage(p, viewer, msg) {
  const c = game.collectionSummary(p.user_id);
  const have = new Map(); // dev -> { count, variants:Set }
  for (const r of c.rows) {
    const h = have.get(r.deviation) || { count: 0, variants: new Set() };
    h.count += r.count;
    if (r.variant) h.variants.add(r.variant);
    have.set(r.deviation, h);
  }
  const best = new Map(); // dev -> best specimen (query is already ordered best-first)
  const specCount = new Map();
  for (const sp of db.q.userSpecimens.all(p.user_id)) {
    const cur = best.get(sp.deviation);
    if (!cur || sp.power + sp.mood > cur.power + cur.mood) best.set(sp.deviation, sp);
    specCount.set(sp.deviation, (specCount.get(sp.deviation) || 0) + 1);
  }
  const all = data.all();
  const totalVariants = all.reduce((s, d) => s + d.variants.length, 0);
  const pct = all.length ? Math.round((c.species / all.length) * 100) : 0;
  const live = game.loadPlayer(p.user_id, p.login, p.display);
  const units = live.units;
  const cardFor = (d) => {
    const h = have.get(d.id);
    const vars = d.variants.length ? `<div class="vars">${d.variants.map((v) => { const got = h?.variants.has(v.name); return `<span class="${got ? `have ${v.kind}` : ""}" title="${v.kind === "skin" ? "Skin" : "Variation"}${got ? " — caught!" : ""}">${got ? "✨ " : ""}${esc(v.name)}</span>`; }).join("")}</div>` : "";
    // caught variations/skins: highlight the card and show the rarest one (skins first)
    const gotVars = h ? d.variants.filter((v) => h.variants.has(v.name)).sort((a, b) => (a.kind === "skin" ? -1 : 0) - (b.kind === "skin" ? -1 : 0)) : [];
    const top = gotVars[0];
    const shiny = top ? ` shiny${top.kind === "skin" ? " skin" : ""}` : "";
    const sp = best.get(d.id);
    const spHtml = sp ? `<div class="sp"><div class="pm"><span title="Skill Rating (Deviant Power)">Skill ${sp.power}/5</span><span title="Activity Rating (Mood)">Activity ${sp.mood}/5</span></div>
<ul class="tr">${[[1, sp.t1, sp.t1_level], [2, sp.t2], [3, sp.t3]].map(([slot, key, lvl]) => (key ? `<li title="${esc(traits.traitEffect(slot, key, lvl, sp.variant, d.category))}"><b>${slot}</b>${esc(traits.traitName(slot, key, lvl, sp.variant, d.category))}</li>` : `<li class="empty"><b>${slot}</b>Empty slot</li>`)).join("")}</ul>${sp.variant ? `<div class="bv">best: ${esc(sp.variant)}</div>` : ""}</div>` : "";
    return `<div class="dev ${h ? "" : "missing"}${shiny}">${h ? `<span class="c">×${h.count}</span>` : ""}${top ? `<span class="vb" title="Variations &amp; skins caught">✨ ${gotVars.length}</span>` : ""}<img loading="lazy" src="${esc((top && top.img) || d.img || "")}" alt="${esc(d.name)}"><div class="n">${h ? esc(d.name) : "???"}</div>${top ? `<div class="vn">✨ ${top.kind === "skin" ? "Skin" : "Variation"}: ${esc(top.name)}</div>` : ""}${tierTag(d.rarity)}${spHtml}${h ? vars : ""}</div>`;
  };
  const cards = sections(all, cardFor);
  return page(`${p.display}'s Securement Pods`, `
<h1>${esc(p.display)}'s Securement Pods</h1>
<div class="stats"><div class="stat"><b>${c.species}/${all.length}</b>deviations</div><div class="stat"><b>${c.variants}/${totalVariants}</b>variants &amp; skins</div><div class="stat"><b>${game.podsUsed(live)}/${game.unitCap(live)}</b>Securement Pods · ${fmt(c.total)} secured</div><div class="stat"><b>${fmt(p.starchrom)}</b>Starchrom</div></div>
<div class="bar"><i style="width:${pct}%"></i></div>
<p>Each card shows your best specimen: its Skill Rating and Activity Rating (1–5) and its traits (0–3) (hover a trait for what it does).</p>
<div id="shop">${webShop(p, live, viewer, msg)}</div>
<p>Empty Securement Units: <b>${units.standard || 0}</b> · Securement Pods used: <b>${game.podsUsed(live)}/${game.unitCap(live)}</b> (caught + empty)${(() => { const g = game.bestGlove(live); return g ? ` · 🧤 <b style="color:${g.color}">${esc(g.name)}</b> (+${Math.round(g.bonus * 100)}% catch)` : ""; })()} · next free unit: ${game.nextUnitIn(live)} (1 every hour while you're in a live stream, after today's <kbd>!daily</kbd>)</p>
${cards}`);
}

// ---------- shop on your own collection page ----------
const IMG_BASE = "https://raw.githubusercontent.com/imb0n3s/ohdeviationhunt/main/ext/";
const SHOP_MSG = {
  not_enough: "Not enough Starchrom for that.", owned: "You already own those gloves.", outclassed: "You already wear better gloves.",
  bad_qty: "Pick an amount between 1 and 100.", full: "Your Securement Pods are full.", too_many: "That would go over your Securement Pod limit.", unknown_item: "That item isn't sold here.", signin: "Sign in with Twitch as the owner of this page to shop.",
};
function webShop(p, live, viewer, msg) {
  const note = msg ? `<div class="note ${msg.ok ? "ok" : "err"}">${esc(msg.text)}</div>` : "";
  if (!viewer) return `<div class="card shopbox">${note}<b>🛒 Shop</b> — is this your page? <a class="btn sm" href="/login?next=${encodeURIComponent("/u/" + p.login)}">Sign in with Twitch</a> to spend your Starchrom on Securement Units and Gloves. <span class="muted">(Only confirms who you are — no permissions.)</span></div>`;
  if (viewer.uid !== p.user_id) return `<div class="card shopbox">${note}Signed in as <b>${esc(viewer.login)}</b> · <a href="/u/${esc(viewer.login)}">go to your Securement Pods</a> to shop · <a href="/logout?next=${encodeURIComponent("/u/" + p.login)}">sign out</a></div>`;
  const best = game.bestGlove(live);
  const form = (it, inner) => `<form method="post" action="/u/${esc(p.login)}/buy"><input type="hidden" name="item" value="${esc(it.id)}">${inner}</form>`;
  const items = shop.ITEMS.map((it) => {
    if (it.kind === "gloves") {
      const owned = (live.gloves || []).includes(it.glove), outclassed = !owned && best && best.bonus > it.bonus;
      const btn = owned ? `<button disabled class="owned">✓ Owned${best && best.id === it.glove ? " · active" : ""}</button>`
        : outclassed ? `<button disabled class="owned">You wear better gloves</button>`
        : `<button ${live.starchrom < it.price ? "disabled" : ""}>${live.starchrom < it.price ? `Need ${fmt(it.price - live.starchrom)} more` : `Buy for ${fmt(it.price)}`}</button>`;
      return `<div class="si glove" style="--gc:${esc(it.color)}"><img src="${IMG_BASE}${esc(it.icon)}" alt=""><div class="sb"><div class="sn">${esc(it.name)} <span class="rar">${esc(it.rarity)}</span></div><div class="sd">+${Math.round(it.bonus * 100)}% catch chance on every throw · ${fmt(it.price)} Starchrom · yours forever</div>${form(it, btn)}</div></div>`;
    }
    const room = game.unitRoom(live), max = Math.max(0, Math.min(it.maxQty, room, Math.floor(live.starchrom / it.price)));
    if (!room) return `<div class="si"><img src="${IMG_BASE}${esc(it.icon)}" alt=""><div class="sb"><div class="sn">${esc(it.name)}</div><div class="sd">${esc(it.desc)} · ${fmt(it.price)} Starchrom each</div><button disabled>Securement Pods full (${game.podsUsed(live)}/${game.unitCap(live)})</button></div></div>`;
    return `<div class="si"><img src="${IMG_BASE}${esc(it.icon)}" alt=""><div class="sb"><div class="sn">${esc(it.name)}</div><div class="sd">${esc(it.desc)} · ${fmt(it.price)} Starchrom each</div>${form(it, `<input type="number" name="qty" min="1" max="${Math.min(it.maxQty, room)}" value="1"><button ${live.starchrom < it.price ? "disabled" : ""}>${live.starchrom < it.price ? `Need ${fmt(it.price - live.starchrom)} more` : "Buy"}</button> <span class="muted">you can buy ${max} (${game.podsUsed(live)}/${game.unitCap(live)} pods used)</span>`)}</div></div>`;
  }).join("");
  return `<div class="card shopbox">${note}<div class="shophead"><b>🛒 Shop</b><span>${fmt(live.starchrom)} Starchrom · ${live.units.standard || 0} Securement Units</span><span class="muted">Signed in as ${esc(viewer.login)} · <a href="/logout?next=${encodeURIComponent("/u/" + p.login)}">sign out</a></span></div><div class="shopgrid">${items}</div></div>`;
}

function commandsPage() {
  const E = ECONOMY, row = (c, d) => `<tr><td><kbd>${c}</kbd></td><td>${d}</td></tr>`;
  const table = (rows) => `<div class="card"><table class="cmds">${rows.join("")}</table></div>`;
  const glovesTxt = shop.ITEMS.filter((i) => i.kind === "gloves").map((i) => `${esc(i.name)} +${Math.round(i.bonus * 100)}% (${fmt(i.price)})`).join(" · ");
  return page("Commands", `<h1>Commands</h1>
<p>Type these in the chat of any channel running ${esc(cfg.BOT_NAME)} (<a href="/channels">where to play</a>). Your Securement Pods are the same on every channel.</p>
<h2>Viewer commands</h2>
${table([
    row("!daily", `Start here. Once a day (resets at midnight Central) while the stream is live: +${E.daily.starchrom} Starchrom and ${E.daily.units.standard} Securement Unit, and it turns on 1 free Securement Unit every hour you play in a live stream for the rest of the day.`),
    row("!secure", `Throw at the deviation that's spotted in the wild (you have ${cfg.SPAWN_WINDOW_SECONDS} seconds). Costs ${E.throwCost} Starchrom and needs an empty Securement Unit; if you catch it, it lives in that unit. One throw per spawn. Also <kbd>!catch</kbd>.`),
    row("!pods", `Your Securement Pods: how many deviations, variants &amp; skins you've secured, plus a link to your collection page. Add a name (<kbd>!pods luna_raventhorn</kbd>) to see someone else's. Also <kbd>!deviationbag</kbd>.`),
    row("!units", `Your Starchrom, Securement Units and when your next free hourly unit arrives. Also <kbd>!inv</kbd>.`),
    row("!shop", `What the shop sells: Securement Units (${fmt(UNITS.standard.price)} Starchrom each) and Gloves — ${glovesTxt}.`),
    row("!buy &lt;amount&gt;", `Buy Securement Units, e.g. <kbd>!buy 3</kbd>. Buy gloves with <kbd>!buy rustic</kbd>, <kbd>!buy bbq</kbd> or <kbd>!buy savior</kbd>. You can hold ${E.unitCap} Securement Pods in total (caught deviations + empty units).`),
    row("!traits [deviation]", `Skill Rating, Activity Rating and traits of your latest catch, or of a deviation you've secured (<kbd>!traits grumpy bulb</kbd>). Also <kbd>!stats</kbd>.`),
    row("!dev &lt;deviation&gt;", `Info about any deviation: rarity, type, variations and skins.`),
    row("!scrap", `Turn duplicate specimens into Starchrom (${Math.round(E.scrapValue * 100)}% of the catch reward each). Keeps your best Skill + Activity specimen of every deviation and frees up pods.`),
    row("!hunttop", `The leaderboard link. Also <kbd>!leaderboard</kbd>.`),
    row("!hunt", `A quick how-to-play reminder in chat.`),
  ])}
<p>You can also shop and see every specimen in the <b>Securement Pods</b> panel under the stream, or on <a href="/me">your own page</a> here.</p>
<h2>Streamer commands</h2>
<p>For the broadcaster and moderators, in your own chat.</p>
${table([
    row("!hunt spawn", "Spawn a deviation right now."),
    row("!hunt interval &lt;minutes&gt;", `How often deviations appear while you're live (2–120 minutes; default about every ${cfg.SPAWN_INTERVAL_MIN}).`),
    row("!hunt off / !hunt on", "Pause or resume spawns. Other commands keep working."),
    row("!hunt status", "Live status, spawn settings, what's loose right now, and spawn/catch totals for your channel."),
    row("!hunt obs", "Your OBS Source link — a Browser Source that shows the deviation and its countdown on stream while it can be caught."),
    row("!hunt leave", "Remove Deviation Hunt from your channel. Everyone keeps their collections."),
    row("!hunt help", "Lists these mod commands in chat."),
  ])}
<h2>Adding the game to your channel</h2>
${table([
    row("!join", `Type it in <a href="https://www.twitch.tv/${esc(db.getBotAccount()?.login || "ohdeviationhunt")}">the bot's chat</a> to add Deviation Hunt to your channel, or use <b>Add to my channel</b> on <a href="/">the home page</a>. Then <kbd>/mod ${esc(db.getBotAccount()?.login || "ohdeviationhunt")}</kbd> in your chat so it isn't rate-limited.`),
    row("!leave", "Type it in the bot's chat to remove the game from your channel."),
  ])}`);
}

function dexPage() {
  const all = data.all();
  const cards = sections(all, (d) => `<div class="dev"><img loading="lazy" src="${esc(d.img || "")}" alt="${esc(d.name)}"><div class="n">${esc(d.name)}</div>${tierTag(d.rarity)}<div class="vars">${d.variants.length ? `<span>${d.variants.length} variants/skins</span>` : ""}</div></div>`);
  return page("All deviations", `<h1>All deviations</h1><p>All ${all.length} deviations can appear in the wild, pulled from the <a href="${esc(cfg.WIKI_BASE)}/Deviation_Main_Page">wiki</a>.</p>${cards}`);
}

function topPage() {
  const rows = db.leaderboard(50);
  const body = rows.length
    ? `<div class="card"><table><tr><th>#</th><th>Meta</th><th>Deviations</th><th>Variants</th><th>Total</th></tr>${rows.map((r, i) => `<tr><td>${i + 1}</td><td><a href="/u/${esc(r.login)}">${esc(r.display)}</a></td><td>${r.species}/${data.all().length}</td><td>${r.variants}</td><td>${fmt(r.total)}</td></tr>`).join("")}</table></div>`
    : `<p>No one has secured a deviation yet.</p>`;
  return page("Leaderboard", `<h1>Leaderboard</h1>${body}`);
}

function createApp(pool) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Old links on the Railway address (e.g. in past chat messages) forward to the real site.
  // The panel API (/ext), Twitch login (/auth) and /health keep answering on both addresses.
  app.use((req, res, next) => {
    const host = String(req.headers.host || "");
    if (host.endsWith(".up.railway.app") && !cfg.BASE_URL.includes(host) && req.method === "GET" && !/^\/(ext|auth|health|setup|admin)\b/.test(req.path)) {
      return res.redirect(301, cfg.BASE_URL + req.originalUrl);
    }
    next();
  });
  require("./extension").mount(app);
  require("./overlay").mount(app, pool);
  app.get("/", async (req, res) => { await refreshAvatars(); res.send(landing(pool)); });
  app.get("/channels", async (req, res) => { await refreshAvatars(); res.send(channelsPage(pool)); });
  app.get("/dex", (req, res) => res.send(dexPage()));
  app.get("/commands", (req, res) => res.send(commandsPage()));
  app.get("/top", (req, res) => res.send(topPage()));
  app.get("/u", (req, res) => res.redirect(`/u/${encodeURIComponent(String(req.query.login || "").trim().replace(/^@/, "").toLowerCase())}`));
  app.get("/u/:login", (req, res) => {
    const p = db.q.getPlayerByLogin.get(String(req.params.login).toLowerCase());
    if (!p) return res.status(404).send(simple("Not found", "No Securement Pods yet", `${esc(req.params.login)} hasn't secured anything yet. Catch one with <kbd>!secure</kbd> in any channel running ${esc(cfg.BOT_NAME)}.`));
    const code = String(req.query.shop || "");
    let msg = null;
    if (code.startsWith("ok:")) { const [, id, n] = code.split(":"); const it = shop.find(id); if (it) msg = { ok: true, text: `Bought ${it.kind === "gloves" ? it.name : `${n} ${it.name}${Number(n) > 1 ? "s" : ""}`}!` }; }
    else if (SHOP_MSG[code]) msg = { ok: false, text: SHOP_MSG[code] };
    res.set("Cache-Control", "no-store");
    res.send(collectionPage(p, viewerOf(req), msg));
  });

  // buy from your own collection page (signed-in owner only; same-site form posts only)
  app.post("/u/:login/buy", express.urlencoded({ extended: false, limit: "2kb" }), (req, res) => {
    const login = String(req.params.login).toLowerCase();
    const back = (code) => res.redirect(303, `/u/${encodeURIComponent(login)}?shop=${encodeURIComponent(code)}#shop`);
    const origin = req.get("origin") || req.get("referer") || "";
    if (origin && !origin.startsWith(cfg.BASE_URL)) return res.status(403).send("forbidden");
    const viewer = viewerOf(req);
    const row = db.q.getPlayerByLogin.get(login);
    if (!row) return res.status(404).send("not found");
    if (!viewer || viewer.uid !== row.user_id) return back("signin");
    let r;
    db.tx(() => {
      const p = game.loadPlayer(row.user_id, row.login, row.display);
      r = shop.purchase(p, req.body.item, req.body.qty || 1);
      if (r.ok) game.savePlayer(p);
    })();
    if (!r.ok) return back(r.error);
    console.log(`[web] ${row.login} bought ${r.qty}x ${r.item.id} for ${r.cost}`);
    back(`ok:${r.item.id}:${r.qty}`);
  });

  // "My Securement Pods": your own page if you're signed in, otherwise sign in with Twitch first
  app.get("/me", (req, res) => {
    const v = viewerOf(req);
    if (!v) return res.redirect("/login?next=/me");
    if (db.q.getPlayer.get(v.uid)) return res.redirect(`/u/${encodeURIComponent(v.login)}`);
    res.send(simple("No Securement Pods yet", "No Securement Pods yet", `You're signed in as <b>${esc(v.login)}</b>, but you haven't played yet. Type <kbd>!secure</kbd> in any channel running ${esc(cfg.BOT_NAME)} the next time a deviation is spotted — see <a href="/channels">where to play</a>. · <a href="/logout">sign out</a>`));
  });

  app.get("/login", (req, res) => {
    const next = /^\/(u\/[a-z0-9_]{1,40}|me)$/i.test(String(req.query.next || "")) ? req.query.next : "/";
    const state = sign({ purpose: "viewer", next, nonce: crypto.randomBytes(8).toString("hex"), ts: Date.now() });
    res.setHeader("Set-Cookie", cookie(state));
    res.redirect(twitch.authorizeUrl({ scopes: [], state }));
  });
  app.get("/logout", (req, res) => {
    const next = /^\/u\/[a-z0-9_]{1,40}$/i.test(String(req.query.next || "")) ? req.query.next : "/";
    res.setHeader("Set-Cookie", sessionCookie("", 0));
    res.redirect(next);
  });
  app.get("/health", (req, res) => res.json({ ok: true, channels: pool.channelCount, botSetUp: !!db.getBotAccount(), data: data.info() }));
  // every player login (public anyway via /u/<login>) — used to keep the Twitch panel tester allowlist in sync
  app.get("/api/players", (req, res) => res.json(db.q.playerLogins.all().map((r) => r.login)));
  app.get("/api/stats", (req, res) => res.json({ channels: db.countChannels(), players: db.countPlayers(), catches: db.totalCatches(), spawns: db.totalSpawns(), starchromSpent: db.starchromSpent() }));

  const cookie = (state) => `dh_state=${state}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600${cfg.BASE_URL.startsWith("https") ? "; Secure" : ""}`;

  app.get("/auth/twitch", (req, res) => {
    if (!db.getBotAccount()) return res.status(503).send(simple("Not ready", "Bot not set up yet", "The bot owner hasn't finished setup."));
    const action = req.query.action === "remove" ? "remove" : "add";
    const state = sign({ purpose: "streamer", action, nonce: crypto.randomBytes(8).toString("hex"), ts: Date.now() });
    res.setHeader("Set-Cookie", cookie(state));
    res.redirect(twitch.authorizeUrl({ scopes: action === "add" ? twitch.STREAMER_SCOPES : [], state }));
  });

  app.get("/setup", (req, res) => {
    if (req.query.key !== cfg.ADMIN_KEY) return res.status(403).send(simple("Forbidden", "Forbidden", "Add ?key=YOUR_ADMIN_KEY to the URL."));
    const state = sign({ purpose: "bot", nonce: crypto.randomBytes(8).toString("hex"), ts: Date.now() });
    res.setHeader("Set-Cookie", cookie(state));
    const cur = db.getBotAccount();
    res.send(simple("Bot setup", "Log in as the bot account",
      `Click below and log in to Twitch <b>as the account the game should chat from</b>, not your personal account. ${cur ? `Currently set up as <b>${esc(cur.login)}</b>; doing this again replaces it.` : ""}`,
      `<p><a class="btn" href="${esc(twitch.authorizeUrl({ scopes: twitch.BOT_SCOPES, state, forceVerify: true }))}">Log in as the bot account</a></p>`));
  });

  app.get("/auth/callback", async (req, res) => {
    try {
      if (req.query.error) return res.status(400).send(simple("Cancelled", "Cancelled", `Twitch said: ${esc(req.query.error_description || req.query.error)}. Nothing was changed.`));
      const state = verify(req.query.state);
      if (!state || getCookie(req, "dh_state") !== req.query.state) return res.status(400).send(simple("Error", "Login expired", "Please start again."));
      const tok = await twitch.exchangeCode(req.query.code);
      const user = await twitch.getUser(tok.access_token);

      if (state.purpose === "viewer") {
        const v = sign({ purpose: "session", uid: user.id, login: user.login, exp: Date.now() + SESSION_DAYS * 864e5, ts: Date.now() });
        res.setHeader("Set-Cookie", sessionCookie(v, SESSION_DAYS * 86400));
        const hasPlayer = !!db.q.getPlayer.get(user.id);
        return res.redirect(state.next === "/me" ? "/me" : hasPlayer ? `/u/${encodeURIComponent(user.login)}#shop` : (state.next || "/"));
      }
      if (state.purpose === "bot") {
        const wasSetUp = !!db.getBotAccount();
        db.saveBotAccount({ user_id: user.id, login: user.login, access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: Date.now() + tok.expires_in * 1000 });
        db.addChannel({ broadcaster_id: user.id, login: user.login, display_name: user.display_name, joined_via: "web" });
        await pool.join(user.id).catch((e) => console.error("[setup] join own channel failed:", e.message));
        if (!wasSetUp) await pool.joinAllFromDb();
        return res.send(simple("Setup complete", `Bot is running as ${user.display_name}`, `Streamers can now add it from <a href="/">the home page</a> or with <code>!join</code> in <a href="https://twitch.tv/${esc(user.login)}">twitch.tv/${esc(user.login)}</a>.`));
      }
      if (state.action === "remove") {
        db.removeChannel(user.id);
        await pool.leave(user.id);
        return res.send(simple("Removed", `Removed from ${user.display_name}'s channel`, "The game has left your chat. Collections are kept, so you can add it back any time."));
      }
      db.addChannel({ broadcaster_id: user.id, login: user.login, display_name: user.display_name, joined_via: "web" });
      try { await pool.join(user.id); }
      catch (e) {
        if (e.message !== "NEEDS_PERMISSION") throw e;
        return res.status(500).send(simple("Almost", "Twitch didn't grant the bot permission", `Try <a href="/auth/twitch?action=add">Add</a> again and click <b>Authorize</b>, or type <code>/mod ${esc(db.getBotAccount().login)}</code> in your chat first.`));
      }
      pool.refreshLive?.();
      return res.send(simple("Added", `Added to ${user.display_name}'s channel!`,
        `Deviations will appear about every ${cfg.SPAWN_INTERVAL_MIN} minutes while you're live. Want one now? Type <code>!hunt spawn</code> in your chat. Please <code>/mod ${esc(db.getBotAccount().login)}</code> so it isn't rate-limited.`));
    } catch (e) {
      console.error("[auth] callback error:", e);
      res.status(500).send(simple("Error", "Something went wrong", esc(e.message)));
    }
  });

  app.get("/admin", (req, res) => {
    if (req.query.key !== cfg.ADMIN_KEY) return res.status(403).send("forbidden");
    const rows = db.listEnabledChannels().map((c) => `<tr><td><a href="https://twitch.tv/${esc(c.login)}">${esc(c.display_name)}</a></td><td>${new Date(c.joined_at).toISOString().slice(0, 10)}</td><td>${pool.spawns.live.has(c.broadcaster_id) ? "LIVE" : "offline"}</td><td>${c.spawns_on ? `every ${c.interval_min || cfg.SPAWN_INTERVAL_MIN}m` : "off"}</td><td>${c.spawns}</td><td>${c.catches}</td><td>${pool.isJoined(c.broadcaster_id) ? "ok" : "<b>not subscribed</b>"}</td></tr>`).join("");
    const d = data.info();
    res.send(page("Admin", `<h1>Admin</h1><div class="card"><table><tr><th>Channel</th><th>Joined</th><th>Stream</th><th>Spawns</th><th>#</th><th>Caught</th><th>Chat</th></tr>${rows}</table></div>
<p>Conduit ${esc(pool.conduitId || "none")} · ${pool.channelCount} subscriptions · data: ${d.count} deviations from ${esc(d.source)} (${d.loadedAt ? new Date(d.loadedAt).toISOString() : "never"}) · <a href="/admin/reload?key=${esc(req.query.key)}">reload wiki data</a></p>`));
  });
  app.get("/admin/reload", async (req, res) => {
    if (req.query.key !== cfg.ADMIN_KEY) return res.status(403).send("forbidden");
    await data.refresh();
    res.json(data.info());
  });
  app.get("/admin/say", async (req, res) => {
    if (req.query.key !== cfg.ADMIN_KEY) return res.status(403).send("forbidden");
    const ch = db.getChannelByLogin(String(req.query.channel || db.getBotAccount()?.login || ""));
    if (!ch) return res.status(404).json({ error: "channel not joined" });
    res.json({ result: await pool.send(ch.broadcaster_id, String(req.query.text || `test message from ${cfg.BOT_NAME}`)) });
  });

  return app;
}

module.exports = { createApp };
