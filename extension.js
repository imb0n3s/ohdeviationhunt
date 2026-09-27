// extension.js — backend for the Deviation Hunt Twitch panel extension.
//
// The panel sends the Twitch-signed extension JWT; we verify it with the extension
// secret (EXT_SECRET, base64, from the Twitch developer console) and look the viewer
// up by their Twitch user id. Collections are global, so the same bag shows on every
// channel that has the panel installed.
//
// Viewers must share their identity with the extension once (Twitch's rule) before we
// get their real user id; until then the panel shows a "Share" button.
const crypto = require("crypto");
const cfg = require("./config");
const db = require("./db");
const data = require("./data");
const traits = require("./traits");
const game = require("./game");

function b64urlDecode(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }

// Minimal HS256 JWT verification (no dependencies)
function verifyExtJwt(token) {
  if (!cfg.EXT_SECRET) throw Object.assign(new Error("extension secret not configured"), { status: 503 });
  const [h, p, sig] = String(token || "").split(".");
  if (!h || !p || !sig) throw Object.assign(new Error("bad token"), { status: 401 });
  let header;
  try { header = JSON.parse(b64urlDecode(h).toString()); } catch { throw Object.assign(new Error("bad token"), { status: 401 }); }
  if (header.alg !== "HS256") throw Object.assign(new Error("bad alg"), { status: 401 });
  const expect = crypto.createHmac("sha256", Buffer.from(cfg.EXT_SECRET, "base64")).update(`${h}.${p}`).digest();
  const got = b64urlDecode(sig);
  if (got.length !== expect.length || !crypto.timingSafeEqual(got, expect)) throw Object.assign(new Error("bad signature"), { status: 401 });
  const payload = JSON.parse(b64urlDecode(p).toString());
  if (payload.exp && payload.exp * 1000 < Date.now()) throw Object.assign(new Error("expired"), { status: 401 });
  return payload; // { user_id?, opaque_user_id, channel_id, role, ... }
}

function bagFor(userId) {
  const p = db.q.getPlayer.get(userId);
  const all = data.all();
  const specs = p ? db.q.userSpecimens.all(userId) : [];
  const best = new Map(), count = new Map(), owned = new Map();
  for (const sp of specs) {
    const cur = best.get(sp.deviation);
    if (!cur || sp.power + sp.mood > cur.power + cur.mood) best.set(sp.deviation, sp);
    count.set(sp.deviation, (count.get(sp.deviation) || 0) + 1);
    if (sp.variant) { if (!owned.has(sp.deviation)) owned.set(sp.deviation, new Set()); owned.get(sp.deviation).add(sp.variant); }
  }
  const catches = p ? db.q.listCatches.all(userId) : [];
  for (const c of catches) if (!count.has(c.deviation)) count.set(c.deviation, c.count); // catches from before specimens existed

  const deviations = all.map((d) => {
    const sp = best.get(d.id);
    return {
      id: d.id, name: d.name, category: d.category, img: d.img,
      owned: count.has(d.id), count: count.get(d.id) || 0,
      variantsOwned: [...(owned.get(d.id) || [])], variantsTotal: d.variants.length,
      variants: d.variants.map((v) => ({ name: v.name, kind: v.kind, img: v.img, owned: !!owned.get(d.id)?.has(v.name) })),
      best: sp ? {
        variant: sp.variant || null, skill: sp.power, activity: sp.mood,
        traits: [[1, sp.t1, sp.t1_level], [2, sp.t2, null], [3, sp.t3, null]].map(([slot, key, lvl]) => ({
          slot, name: traits.traitName(slot, key, lvl, sp.variant, d.category), effect: traits.traitEffect(slot, key, lvl, sp.variant, d.category),
        })),
      } : null,
    };
  });
  const summary = game.collectionSummary(userId);
  return {
    player: p ? { login: p.login, display: p.display, starchrom: p.starchrom, units: JSON.parse(p.units || "{}").standard || 0 } : null,
    stats: { unique: summary.species, total: summary.total, variants: summary.variants, all: all.length, allVariants: all.reduce((s, d) => s + d.variants.length, 0) },
    page: p ? `${cfg.BASE_URL}/u/${p.login}` : null,
    deviations,
  };
}

function mount(app) {
  // CORS: extension front ends are served from https://<client-id>.ext-twitch.tv
  app.use("/ext", (req, res, next) => {
    const origin = req.headers.origin || "";
    if (/^https:\/\/[a-z0-9]+\.ext-twitch\.tv$/.test(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      res.set({ "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" });
    }
    if (req.method === "OPTIONS") { console.log(`[ext] preflight origin=${origin || "-"}`); return res.sendStatus(204); }
    next();
  });

  app.get("/ext/bag", (req, res) => {
    try {
      const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const jwt = verifyExtJwt(token);
      console.log(`[ext] bag ok origin=${req.headers.origin || "-"} user=${jwt.user_id || "(no identity)"} channel=${jwt.channel_id || "-"}`);
      if (!jwt.user_id) return res.json({ needsIdentity: true, botLogin: db.getBotAccount()?.login || null });
      res.set("Cache-Control", "no-store");
      res.json(bagFor(jwt.user_id));
    } catch (e) {
      console.warn(`[ext] bag failed ${e.status || 500}: ${e.message} origin=${req.headers.origin || "-"} auth=${req.headers.authorization ? "yes" : "no"}`);
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

module.exports = { mount, verifyExtJwt, bagFor };
