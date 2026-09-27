// web.js — public site: landing + "Add to my channel", collection pages, leaderboard,
// OAuth callback, /setup for the bot account, /admin, /health
const express = require("express");
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
.stats{display:flex;gap:12px;flex-wrap:wrap}.stat{flex:1;min-width:130px;background:var(--card);border-radius:12px;padding:14px;text-align:center;color:var(--muted)}
.stat b{display:block;font-size:1.9rem;color:var(--accent)}
.chat{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.88em;white-space:pre-wrap;color:#dfe8f0;overflow-wrap:anywhere}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.dev{background:var(--card);border-radius:12px;padding:10px;text-align:center;border:2px solid transparent;position:relative}
.dev img{width:100%;aspect-ratio:1;object-fit:contain;display:block}
.dev .n{font-weight:600;font-size:.92rem;margin-top:6px}.dev .t{font-size:.78rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase}
.dev .c{position:absolute;top:8px;right:10px;font-size:.8rem;background:#0b1016;border-radius:99px;padding:1px 8px}
.sp{margin-top:8px;text-align:left;font-size:.78rem}.pm{display:flex;justify-content:center;gap:10px;font-weight:600;color:#fde68a;margin-bottom:4px}
.tr{list-style:none;margin:0;padding:0}.tr li{padding:2px 0;border-top:1px solid var(--line);color:var(--text);cursor:help}.tr li b{display:inline-block;width:16px;color:var(--accent)}
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
nav{display:flex;gap:18px;margin-bottom:24px;flex-wrap:wrap}nav a{color:var(--muted);text-decoration:none;font-weight:600}nav a:hover{color:var(--text)}
</style></head><body><main><nav><a href="/">${esc(cfg.BOT_NAME)}</a><a href="/dex">All deviations</a><a href="/top">Leaderboard</a><a href="${esc(cfg.WIKI_BASE)}">OHWikiGuide</a></nav>${body}
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

function landing() {
  const bot = db.getBotAccount();
  const botName = bot?.login || "the bot";
  return page(cfg.BOT_NAME, `
<h1>${esc(cfg.BOT_NAME)} — catch Once Human deviations in Twitch chat</h1>
<p>While you're live, deviations breach containment in your chat. Viewers throw Securement Units with <kbd>!secure</kbd>, earn Starchrom, and build a Deviation Bag that follows them to every channel running the game. Every deviation, variation and skin comes straight from <a href="${esc(cfg.WIKI_BASE)}/Deviation_Main_Page">the OHWikiGuide Deviation page</a>, so new ones join the game as soon as they're on the wiki.</p>
<div class="card">
  <a class="btn" href="/auth/twitch?action=add">Add ${esc(cfg.BOT_NAME)} to my channel</a><a class="btn secondary" href="/auth/twitch?action=remove">Remove it</a>
  <p style="margin-bottom:0">You log in with Twitch once; the bot only gets permission to read and post in your chat.${bot ? ` Prefer chat? Type <kbd>!join</kbd> in <a href="https://twitch.tv/${esc(bot.login)}">twitch.tv/${esc(bot.login)}</a>.` : ""} Then <kbd>/mod ${esc(botName)}</kbd> so it isn't rate-limited.</p>
</div>
<div class="stats"><div class="stat"><b>${fmt(db.countChannels())}</b>channels</div><div class="stat"><b>${fmt(db.countPlayers())}</b>Metas</div><div class="stat"><b>${fmt(db.totalCatches())}</b>deviations secured</div><div class="stat"><b>${data.all().length}</b>deviations</div></div>

<h2>Find a collection</h2>
<form class="find" action="/u" method="get"><input name="login" placeholder="Twitch username" aria-label="Twitch username"><button>View</button></form>

<h2>What it looks like</h2>
<div class="card chat">${esc(botName)}: ⚠️ A wild Lonewolf Whisper has breached containment! Type !secure within ${cfg.SPAWN_WINDOW_SECONDS}s to catch it.
viewer42: !secure
metabones: !secure
${esc(botName)}: 🔒 Lonewolf Whisper secured by metabones [Skill 4/5 · Activity 2/5]! +40 Starchrom each. 📖 New entry for metabones (+100). | !traits lonewolfwhisper for traits</div>

<h2>Viewer commands</h2>
<div class="card">
<p><kbd>!secure</kbd> — throw a Securement Unit at the loose deviation (one throw per breach). <kbd>!catch</kbd> works too.</p>
<p><kbd>!units</kbd> — your Starchrom and Units · <kbd>!shop</kbd> — prices · <kbd>!buy 5</kbd> — buy Securement Units</p>
<p><kbd>!daily</kbd> — free supply drop (+${ECONOMY.daily.starchrom} Starchrom, ${ECONOMY.daily.units.standard} Standard Units) every ${ECONOMY.dailyCooldownHours}h</p>
<p><kbd>!deviationbag</kbd> — your Deviation Bag and collection link · <kbd>!deviationbag name</kbd> — someone else's · <kbd>!scrap</kbd> — turn duplicates into Starchrom</p>
<p><kbd>!traits</kbd> — your latest catch's Skill Rating, Activity Rating and traits · <kbd>!traits lonewolf</kbd> — your best Lonewolf Whisper</p>
<p><kbd>!dev behemoth</kbd> — what a deviation does and where it drops · <kbd>!hunttop</kbd> — leaderboard · <kbd>!hunt</kbd> — help</p>
</div>
<h2>Streamer & mod commands</h2>
<div class="card">
<p><kbd>!hunt spawn</kbd> — release one right now · <kbd>!hunt interval 10</kbd> — minutes between breaches (default ${cfg.SPAWN_INTERVAL_MIN}) · <kbd>!hunt off</kbd> / <kbd>!hunt on</kbd> · <kbd>!hunt status</kbd> · <kbd>!hunt leave</kbd></p>
<p>Deviations only breach while your stream is live and someone has chatted in the last ${cfg.ACTIVITY_WINDOW_MIN} minutes.</p>
</div>
<h2>How catching works</h2>
<div class="card"><table><tr><th>Rarity</th><th>Spawn weight</th><th>Capture rate</th><th>Reward</th></tr>
${Object.values(TIERS).map((t) => `<tr><td style="color:${t.color};font-weight:600">${t.label}</td><td>${t.weight}%</td><td>${Math.round(t.catch * 100)}%</td><td>${t.reward} Starchrom</td></tr>`).join("")}
<tr><td style="color:${TIERS.legendary.color};font-weight:600">Skin (Legendary)</td><td>1 in ${Math.round(1 / VARIANT.skin.chance)}</td><td>${Math.round(VARIANT.skin.catch * 100)}%</td><td>${TIERS.legendary.reward} Starchrom</td></tr></table>
<p>Every throw uses one Securement Unit (${UNITS.standard.price} Starchrom each; free ones from <kbd>!daily</kbd>). About 1 in ${Math.round(1 / VARIANT.variation.chance)} breaches is a <b>Variation</b> (×${VARIANT.variation.rewardMult} reward, a little harder to catch) and 1 in ${Math.round(1 / VARIANT.skin.chance)} is a <b>Skin</b>, which is always Legendary with a ${Math.round(VARIANT.skin.catch * 100)}% capture rate. Every deviation you secure is its own specimen with <b>Skill Rating 1–5</b> and <b>Activity Rating 1–5</b> (5 is rare; a perfect 5/5 gets a ⭐) and three traits rolled by the rules on the wiki's <a href="${esc(cfg.WIKI_BASE)}/Deviation_Trait_Page">Deviation Trait Page</a>: Slot 1 is a Global trait or that deviation's own trait, Slot 2 is a combat, crafting or territory trait matching the deviation's type (deviation-specific ones only on their own deviation, and variant-specific ones like Grumpy Bulb's Violet Robe only on that variant), Slot 3 is a fused trait. <kbd>!scrap</kbd> keeps your best Skill + Activity specimen of each. First time you secure something: +${ECONOMY.newSpeciesBonus} bonus. Missed throws still salvage ${ECONOMY.escapeSalvage} Starchrom.</p></div>`);
}

function collectionPage(p) {
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
  const units = JSON.parse(p.units || "{}");
  const cardFor = (d) => {
    const h = have.get(d.id);
    const vars = d.variants.length ? `<div class="vars">${d.variants.map((v) => { const got = h?.variants.has(v.name); return `<span class="${got ? `have ${v.kind}` : ""}" title="${v.kind === "skin" ? "Skin" : "Variation"}${got ? " — caught!" : ""}">${got ? "✨ " : ""}${esc(v.name)}</span>`; }).join("")}</div>` : "";
    // caught variations/skins: highlight the card and show the rarest one (skins first)
    const gotVars = h ? d.variants.filter((v) => h.variants.has(v.name)).sort((a, b) => (a.kind === "skin" ? -1 : 0) - (b.kind === "skin" ? -1 : 0)) : [];
    const top = gotVars[0];
    const shiny = top ? ` shiny${top.kind === "skin" ? " skin" : ""}` : "";
    const sp = best.get(d.id);
    const spHtml = sp ? `<div class="sp"><div class="pm"><span title="Skill Rating (Deviant Power)">Skill ${sp.power}/5</span><span title="Activity Rating (Mood)">Activity ${sp.mood}/5</span></div>
<ul class="tr">${[[1, sp.t1, sp.t1_level], [2, sp.t2], [3, sp.t3]].map(([slot, key, lvl]) => `<li title="${esc(traits.traitEffect(slot, key, lvl, sp.variant, d.category))}"><b>${slot}</b>${esc(traits.traitName(slot, key, lvl, sp.variant, d.category))}</li>`).join("")}</ul>${sp.variant ? `<div class="bv">best: ${esc(sp.variant)}</div>` : ""}</div>` : "";
    return `<div class="dev ${h ? "" : "missing"}${shiny}">${h ? `<span class="c">×${h.count}</span>` : ""}${top ? `<span class="vb" title="Variations &amp; skins caught">✨ ${gotVars.length}</span>` : ""}<img loading="lazy" src="${esc((top && top.img) || d.img || "")}" alt="${esc(d.name)}"><div class="n">${h ? esc(d.name) : "???"}</div>${top ? `<div class="vn">✨ ${top.kind === "skin" ? "Skin" : "Variation"}: ${esc(top.name)}</div>` : ""}${tierTag(d.rarity)}${spHtml}${h ? vars : ""}</div>`;
  };
  const cards = sections(all, cardFor);
  return page(`${p.display}'s Deviation Bag`, `
<h1>${esc(p.display)}'s Deviation Bag</h1>
<div class="stats"><div class="stat"><b>${c.species}/${all.length}</b>deviations</div><div class="stat"><b>${c.variants}/${totalVariants}</b>variants &amp; skins</div><div class="stat"><b>${fmt(c.total)}</b>secured</div><div class="stat"><b>${fmt(p.starchrom)}</b>Starchrom</div></div>
<div class="bar"><i style="width:${pct}%"></i></div>
<p>Each card shows your best specimen: its Skill Rating and Activity Rating (1–5) and its three traits (hover a trait for what it does).</p>
<p>Securement Units: ${units.standard || 0}</p>
${cards}`);
}

function dexPage() {
  const all = data.all();
  const cards = sections(all, (d) => `<div class="dev"><img loading="lazy" src="${esc(d.img || "")}" alt="${esc(d.name)}"><div class="n">${esc(d.name)}</div>${tierTag(d.rarity)}<div class="vars">${d.variants.length ? `<span>${d.variants.length} variants/skins</span>` : ""}</div></div>`);
  return page("All deviations", `<h1>All deviations</h1><p>All ${all.length} deviations can breach containment, pulled from the <a href="${esc(cfg.WIKI_BASE)}/Deviation_Main_Page">wiki</a>.</p>${cards}`);
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

  require("./extension").mount(app);
  app.get("/", (req, res) => res.send(landing()));
  app.get("/dex", (req, res) => res.send(dexPage()));
  app.get("/top", (req, res) => res.send(topPage()));
  app.get("/u", (req, res) => res.redirect(`/u/${encodeURIComponent(String(req.query.login || "").trim().replace(/^@/, "").toLowerCase())}`));
  app.get("/u/:login", (req, res) => {
    const p = db.q.getPlayerByLogin.get(String(req.params.login).toLowerCase());
    if (!p) return res.status(404).send(simple("Not found", "No Deviation Bag yet", `${esc(req.params.login)} hasn't secured anything yet. Catch a breach with <kbd>!secure</kbd> in any channel running ${esc(cfg.BOT_NAME)}.`));
    res.send(collectionPage(p));
  });
  app.get("/health", (req, res) => res.json({ ok: true, channels: pool.channelCount, botSetUp: !!db.getBotAccount(), data: data.info() }));
  app.get("/api/stats", (req, res) => res.json({ channels: db.countChannels(), players: db.countPlayers(), catches: db.totalCatches(), spawns: db.totalSpawns() }));

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
        `Deviations will breach about every ${cfg.SPAWN_INTERVAL_MIN} minutes while you're live. Want one now? Type <code>!hunt spawn</code> in your chat. Please <code>/mod ${esc(db.getBotAccount().login)}</code> so it isn't rate-limited.`));
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
