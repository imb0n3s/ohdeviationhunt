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
const { BITS_PACKS } = require("./rarity");
const cfg = require("./config");
const db = require("./db");
const data = require("./data");
const traits = require("./traits");
const game = require("./game");
const shop = require("./shop");
const express = require("express");

function b64urlDecode(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }

// Minimal HS256 JWT verification (no dependencies)
function verifyExtJwt(token) {
  if (!cfg.EXT_SECRETS.length) throw Object.assign(new Error("extension secret not configured"), { status: 503 });
  const [h, p, sig] = String(token || "").split(".");
  if (!h || !p || !sig) throw Object.assign(new Error("bad token"), { status: 401 });
  let header;
  try { header = JSON.parse(b64urlDecode(h).toString()); } catch { throw Object.assign(new Error("bad token"), { status: 401 }); }
  if (header.alg !== "HS256") throw Object.assign(new Error("bad alg"), { status: 401 });
  const got = b64urlDecode(sig);
  const ok = cfg.EXT_SECRETS.some((secret) => {
    const expect = crypto.createHmac("sha256", Buffer.from(secret, "base64")).update(`${h}.${p}`).digest();
    return got.length === expect.length && crypto.timingSafeEqual(got, expect);
  });
  if (!ok) {
    let info = "";
    try { const pl = JSON.parse(b64urlDecode(p).toString()); info = ` (token role=${pl.role} channel=${pl.channel_id} exp_in=${Math.round(pl.exp - Date.now() / 1000)}s, header=${JSON.stringify(header)})`; } catch {}
    throw Object.assign(new Error("bad signature" + info), { status: 401 });
  }
  const payload = JSON.parse(b64urlDecode(p).toString());
  if (payload.exp && payload.exp * 1000 < Date.now()) throw Object.assign(new Error("expired"), { status: 401 });
  return payload; // { user_id?, opaque_user_id, channel_id, role, ... }
}

// balances the panel shows
const playerInfo = (p) => ({ login: p.login, display: p.display, starchrom: p.starchrom, units: p.units.standard || 0, nextUnitIn: game.nextUnitIn(p), hourly: game.hourlyStatus(p), now: Date.now(), gloves: p.gloves || [], glove: game.bestGlove(p)?.id || null, unitCap: game.unitCap(p), podsUsed: game.podsUsed(p) });

const specView = (x, d) => ({
  id: x.id, variant: x.variant || null, skill: x.power, activity: x.mood, caughtAt: x.caught_at,
  traits: [[1, x.t1, x.t1_level], [2, x.t2, null], [3, x.t3, null]].map(([slot, key, lvl]) => ({
    slot, name: traits.traitName(slot, key, lvl, x.variant, d.category), effect: traits.traitEffect(slot, key, lvl, x.variant, d.category),
  })),
});

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
      specimens: specs.filter((x) => x.deviation === d.id).map((x) => specView(x, d)),
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
    player: p ? playerInfo(game.loadPlayer(p.user_id, p.login, p.display)) : null,
    shop: shop.catalog(),
    bitsPacks: BITS_PACKS,
    destroyValue: require("./rarity").ECONOMY.destroyValue,
    destroyUnits: require("./rarity").ECONOMY.destroyUnits,
    stats: { unique: summary.species, total: summary.total, variants: summary.variants, all: all.length, allVariants: all.reduce((s, d) => s + d.variants.length, 0),
      variations: summary.variations, skins: summary.skins,
      allVariations: all.reduce((s, d) => s + d.variants.filter((v) => v.kind === "variation").length, 0),
      allSkins: all.reduce((s, d) => s + d.variants.filter((v) => v.kind === "skin").length, 0) },
    page: p ? `${cfg.BASE_URL}/u/${p.login}` : null,
    deviations,
  };
}

function auth(req) {
  const jwt = verifyExtJwt((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  if (!jwt.user_id) throw Object.assign(new Error("share your Twitch identity with the panel first"), { status: 403, needsIdentity: true });
  return jwt;
}

function mount(app) {
  // length only (never the value) so a bad paste is easy to spot: Twitch extension secrets are
  // 44 base64 characters that decode to 32 bytes
  if (cfg.EXT_SECRETS.length) console.log(`[ext] ${cfg.EXT_SECRETS.length} secret(s) loaded: ${cfg.EXT_SECRETS.map((x) => `${x.length} chars/${Buffer.from(x, "base64").length} bytes`).join(", ")}`);
  else console.log("[ext] no EXT_SECRET set");
  // CORS: extension front ends are served from https://<client-id>.ext-twitch.tv
  app.use("/ext", (req, res, next) => {
    const origin = req.headers.origin || "";
    if (/^https:\/\/[a-z0-9]+\.ext-twitch\.tv$/.test(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      res.set({ "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" });
    }
    if (req.method === "OPTIONS") { console.log(`[ext] preflight origin=${origin || "-"}`); return res.sendStatus(204); }
    next();
  });

  // every chat command, for the panel's Commands tab (public — no sign-in needed)
  app.get("/ext/commands", (req, res) => { res.set("Cache-Control", "public, max-age=300"); res.json(require("./cmdlist").commandSections()); });

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

  // Buy from the shop with Starchrom. Body: { item: "unit", qty: 3 }
  app.post("/ext/shop/buy", express.json({ limit: "1kb" }), (req, res) => {
    try {
      const jwt = auth(req);
      const row = db.q.getPlayer.get(jwt.user_id);
      if (!row) return res.status(404).json({ error: "no_player", message: "Catch your first deviation in chat with !secure to start playing." });
      let result;
      db.tx(() => {
        const p = game.loadPlayer(row.user_id, row.login, row.display);
        result = shop.purchase(p, req.body?.item, req.body?.qty);
        if (result.ok) game.savePlayer(p);
        result.player = playerInfo(p);
      })();
      if (!result.ok) return res.status(400).json({ error: result.error, max: result.max, cost: result.cost, player: result.player });
      console.log(`[ext] ${row.login} bought ${result.qty}x ${result.item.id} for ${result.cost}`);
      try { game.announcePurchase(row.user_id, result.item, result.qty); } catch (e) { console.warn("[ext] announce failed:", e.message); }
      res.json({ ok: true, item: result.item.id, qty: result.qty, cost: result.cost, player: result.player });
    } catch (e) {
      if (e.needsIdentity) return res.status(403).json({ error: "needs_identity" });
      console.warn(`[ext] buy failed ${e.status || 500}: ${e.message}`);
      res.status(e.status || 500).json({ error: e.status ? e.message : "server_error" });
    }
  });

  // Bits purchase: the panel sends Twitch's signed transaction receipt after useBits() completes.
  app.post("/ext/bits/complete", express.json({ limit: "8kb" }), (req, res) => {
    try {
      const jwt = auth(req);
      const receipt = verifyExtJwt(req.body?.receipt);
      const d = receipt.data || {};
      if (receipt.topic !== "bits_transaction_receipt" || !d.transactionId) return res.status(400).json({ error: "bad_receipt" });
      if (String(d.userId) !== String(jwt.user_id)) return res.status(403).json({ error: "wrong_user" });
      const pack = BITS_PACKS.find((x) => x.sku === d.product?.sku);
      if (!pack || Number(d.product?.cost?.amount) !== pack.bits) return res.status(400).json({ error: "unknown_product" });
      const row = db.q.getPlayer.get(jwt.user_id);
      if (!row) return res.status(404).json({ error: "no_player" });
      let credited = false, player;
      db.tx(() => {
        const p = game.loadPlayer(row.user_id, row.login, row.display);
        credited = db.q.addBitsTx.run(d.transactionId, row.user_id, pack.sku, pack.bits, pack.starchrom || 0, jwt.channel_id || null, Date.now()).changes === 1;
        if (credited) { p.starchrom += pack.starchrom || 0; p.extra_cap = (p.extra_cap || 0) + (pack.capacity || 0); game.savePlayer(p); }
        player = playerInfo(p);
      })();
      console.log(`[ext] bits ${credited ? "credited" : "duplicate"}: ${row.login} ${pack.sku} (${pack.bits} bits) tx=${d.transactionId}`);
      res.json({ ok: true, credited, starchrom: pack.starchrom || 0, capacity: pack.capacity || 0, player });
    } catch (e) {
      if (e.needsIdentity) return res.status(403).json({ error: "needs_identity" });
      console.warn(`[ext] bits failed ${e.status || 500}: ${e.message}`);
      res.status(e.status || 500).json({ error: e.status ? e.message : "server_error" });
    }
  });

  // Destroy one of your specimens for Starchrom (only while you own more than one of that deviation)
  app.post("/ext/specimen/destroy", express.json({ limit: "1kb" }), (req, res) => {
    try {
      const jwt = auth(req);
      if (!db.q.getPlayer.get(jwt.user_id)) return res.status(404).json({ error: "no_player" });
      const r = game.destroySpecimen(jwt.user_id, req.body?.id);
      if (!r.ok) return res.status(400).json({ error: r.error });
      console.log(`[ext] ${r.p.login} destroyed a ${r.deviation} for ${r.gained} + ${r.units} unit(s)`);
      res.json({ ok: true, gained: r.gained, units: r.units, bag: bagFor(jwt.user_id) });
    } catch (e) {
      if (e.needsIdentity) return res.status(403).json({ error: "needs_identity" });
      console.warn(`[ext] destroy failed ${e.status || 500}: ${e.message}`);
      res.status(e.status || 500).json({ error: e.status ? e.message : "server_error" });
    }
  });
}

module.exports = { playerInfo, mount, verifyExtJwt, bagFor };
