// stripe.js — website-only card payments through B's Stripe account (B 2026-11-25).
// Never used by the Twitch panel: the panel only ever takes Bits.
//
// Artisan's Touch ×3 for $2.99 (Stripe price lookup key "artisan3_web"): Stripe Checkout -> webhook
// checkout.session.completed -> +3 stored Artisan's Touch (players.artisan_left), used one at a time from the shop
// on the player's own Securement Pods page. Each use repairs the worn gloves to full catches, or gives 1,250
// Starchrom when there is nothing to repair (same as the 250-Bit one in the panel).
//
// Railway env: STRIPE_SECRET_KEY (a restricted key is enough: Checkout Sessions write, Prices read),
// STRIPE_WEBHOOK_SECRET (whsec_… of the endpoint <BASE_URL>/stripe/webhook, event checkout.session.completed
// + checkout.session.async_payment_succeeded). Without the key the website shows nothing of this.
// Sales tax: Stripe Tax on top of the price (automatic_tax); STRIPE_AUTOMATIC_TAX=0 turns that off.
const crypto = require("crypto");
const db = require("./db");
const game = require("./game");

const KEY = process.env.STRIPE_SECRET_KEY || "";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET || "";
const AUTO_TAX = process.env.STRIPE_AUTOMATIC_TAX !== "0";

const PRODUCTS = {
  artisan3: { lookupKey: "artisan3_web", name: "Artisan's Touch ×3", uses: 3, price: "$2.99" },
};
const ARTISAN_STARCHROM = 1250; // nothing to repair: same as the panel's 250 Bits × 5

db.raw.exec(`CREATE TABLE IF NOT EXISTS stripe_tx (session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item TEXT NOT NULL,
  qty INTEGER NOT NULL, amount_cents INTEGER, currency TEXT, at INTEGER NOT NULL)`);
try { db.raw.exec(`ALTER TABLE players ADD COLUMN artisan_left INTEGER NOT NULL DEFAULT 0`); } catch {}
const Q = {
  addTx: db.raw.prepare(`INSERT OR IGNORE INTO stripe_tx (session_id, user_id, item, qty, amount_cents, currency, at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  addArtisan: db.raw.prepare(`UPDATE players SET artisan_left = artisan_left + ? WHERE user_id = ?`),
  takeArtisan: db.raw.prepare(`UPDATE players SET artisan_left = artisan_left - 1 WHERE user_id = ? AND artisan_left > 0`),
  artisanLeft: db.raw.prepare(`SELECT artisan_left FROM players WHERE user_id = ?`),
};

const enabled = () => !!KEY;
const artisanLeft = (uid) => Q.artisanLeft.get(uid)?.artisan_left || 0;

async function api(method, path, form) {
  const body = form ? new URLSearchParams(form).toString() : undefined;
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method, body, signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${KEY}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error?.message || `stripe ${r.status}`); e.status = r.status; throw e; }
  return j;
}

const priceCache = new Map();
async function priceId(lookupKey) {
  const c = priceCache.get(lookupKey);
  if (c && Date.now() - c.at < 3600e3) return c.id;
  const j = await api("GET", `/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKey)}`);
  const id = j.data?.[0]?.id;
  if (!id) throw new Error(`no active Stripe price with lookup key ${lookupKey}`);
  priceCache.set(lookupKey, { id, at: Date.now() });
  return id;
}

// -> Stripe Checkout URL for one pack, paid by the signed-in player (uid) from their own page
async function checkoutUrl(item, player, baseUrl) {
  const P = PRODUCTS[item];
  if (!P || !enabled()) throw new Error("not available");
  const back = `${baseUrl}/u/${encodeURIComponent(player.login)}`;
  const form = {
    mode: "payment",
    "line_items[0][price]": await priceId(P.lookupKey),
    "line_items[0][quantity]": "1",
    client_reference_id: player.user_id,
    "metadata[uid]": player.user_id, "metadata[login]": player.login, "metadata[item]": item,
    "payment_intent_data[metadata][uid]": player.user_id, "payment_intent_data[metadata][item]": item,
    "payment_intent_data[description]": `${P.name} for ${player.login} (Deviation Hunt)`,
    success_url: `${back}?shop=stripe_paid&t=${Date.now().toString(36)}#shop`,
    cancel_url: `${back}?shop=stripe_cancel#shop`,
  };
  if (AUTO_TAX) form["automatic_tax[enabled]"] = "true";
  const s = await api("POST", "/checkout/sessions", form);
  return s.url;
}

// Stripe-Signature: "t=…,v1=…" over `${t}.${rawBody}` (HMAC-SHA256 with the endpoint secret), 5-minute tolerance
function verify(raw, header) {
  if (!WHSEC) return null;
  const parts = Object.fromEntries(String(header || "").split(",").map((x) => x.split("=")).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = String(header || "").split(",").filter((x) => x.trim().startsWith("v1=")).map((x) => x.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return null;
  const want = crypto.createHmac("sha256", WHSEC).update(`${t}.${raw}`).digest("hex");
  const ok = sigs.some((s) => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
  if (!ok) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// a paid Checkout session -> credit once (stripe_tx keyed by the session id)
function credit(session) {
  if (session.payment_status !== "paid") return { skipped: "not paid" };
  const item = session.metadata?.item, uid = session.metadata?.uid || session.client_reference_id, P = PRODUCTS[item];
  if (!P || !uid) return { skipped: "not ours" };
  const row = db.q.getPlayer.get(uid);
  if (!row) return { skipped: "no player" };
  let credited = false;
  db.tx(() => {
    credited = Q.addTx.run(session.id, uid, item, P.uses, session.amount_total ?? null, session.currency || null, Date.now()).changes === 1;
    if (credited) {
      Q.addArtisan.run(P.uses, uid);
      db.logPurchase(uid, row.display, row.last_channel, `${P.name} (website)`);
    }
  })();
  return { credited, login: row.login, item };
}

// use one stored Artisan's Touch: repair the worn gloves to full, or 1,250 Starchrom when there's nothing to repair
function useArtisan(row) {
  let out = null;
  db.tx(() => {
    if (Q.takeArtisan.run(row.user_id).changes !== 1) { out = { ok: false, error: "artisan_none" }; return; }
    const p = game.loadPlayer(row.user_id, row.login, row.display);
    let g = game.bestGlove(p);
    if (g && (p.glove_left || 0) >= g.catches) g = null; // already like new: same as no gloves
    if (g) p.glove_left = Math.max(p.glove_left || 0, g.catches); else p.starchrom += ARTISAN_STARCHROM;
    game.savePlayer(p);
    db.logPurchase(row.user_id, row.display, p.last_channel, g ? `Artisan's Touch (repaired ${g.name})` : `Artisan's Touch (nothing to repair: ${ARTISAN_STARCHROM.toLocaleString("en-US")} Starchrom)`);
    out = { ok: true, repaired: g ? g.name : null, starchrom: g ? 0 : ARTISAN_STARCHROM, left: artisanLeft(row.user_id) };
  })();
  return out;
}

module.exports = { enabled, artisanLeft, checkoutUrl, verify, credit, useArtisan, PRODUCTS, ARTISAN_STARCHROM };
