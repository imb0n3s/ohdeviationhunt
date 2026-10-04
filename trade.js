// trade.js — one-to-one deviation trades between two players, done on the website.
//
// A player picks up to MAX_PER_SIDE of their own specimens and up to MAX_PER_SIDE of the other
// player's, and sends an offer. The other player accepts or declines; the sender can cancel.
// Nothing is locked while an offer waits — on accept everything is re-checked (both still own
// every specimen, both have Securement Pod room) and the swap happens in one transaction, so
// it either fully happens or not at all. A traded specimen keeps its ratings, traits and variant.
const db = require("./db");
const data = require("./data");
const game = require("./game");

const MAX_PER_SIDE = 5;
const MAX_OPEN_OUT = 5;              // pending offers one player can have sent at once
const EXPIRE_MS = 3 * 24 * 3600e3;   // offers expire after 3 days

db.raw.exec(`CREATE TABLE IF NOT EXISTS trades (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user   TEXT NOT NULL,
  to_user     TEXT NOT NULL,
  give        TEXT NOT NULL,   -- JSON array of specimen ids the sender gives
  get         TEXT NOT NULL,   -- JSON array of specimen ids the sender wants
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | cancelled | failed
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
)`);

const Q = Object.fromEntries(Object.entries({
  insert: `INSERT INTO trades (from_user, to_user, give, get, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
  get: `SELECT * FROM trades WHERE id=?`,
  setStatus: `UPDATE trades SET status=?, note=?, updated_at=? WHERE id=?`,
  forUser: `SELECT * FROM trades WHERE (from_user=? OR to_user=?) ORDER BY id DESC LIMIT 40`,
  pendingOut: `SELECT COUNT(*) AS n FROM trades WHERE from_user=? AND status='pending' AND created_at>?`,
  pendingIn: `SELECT COUNT(*) AS n FROM trades WHERE to_user=? AND status='pending' AND created_at>?`,
  pendingPair: `SELECT id FROM trades WHERE status='pending' AND created_at>? AND ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))`,
  moveSpecimen: `UPDATE specimens SET user_id=? WHERE id=? AND user_id=?`,
}).map(([k, sql]) => [k, db.raw.prepare(sql)]));

const ids = (list) => [...new Set((Array.isArray(list) ? list : [list]).filter((x) => x !== undefined && x !== "").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
const kindOf = (devId, variant) => (variant ? data.get(devId)?.variants.find((v) => v.name === variant)?.kind || "variation" : "base");
const now = () => Date.now();
const live = (t) => t.status === "pending" && now() - t.created_at < EXPIRE_MS;

// Offer a trade. Returns { ok, id } or { ok:false, error }
function create(fromUid, toLogin, giveList, getList) {
  const from = db.q.getPlayer.get(fromUid);
  const to = db.q.getPlayerByLogin.get(String(toLogin || "").toLowerCase().replace(/^@/, ""));
  if (!from) return { ok: false, error: "not_player" };
  if (!to) return { ok: false, error: "no_such_player" };
  if (to.user_id === fromUid) return { ok: false, error: "self" };
  const give = ids(giveList), get = ids(getList);
  if (!give.length || !get.length) return { ok: false, error: "empty" };
  if (give.length > MAX_PER_SIDE || get.length > MAX_PER_SIDE) return { ok: false, error: "too_many" };
  if (give.some((id) => !db.q.getSpecimen.get(id, fromUid))) return { ok: false, error: "not_yours" };
  if (get.some((id) => !db.q.getSpecimen.get(id, to.user_id))) return { ok: false, error: "not_theirs" };
  const since = now() - EXPIRE_MS;
  if (Q.pendingOut.get(fromUid, since).n >= MAX_OPEN_OUT) return { ok: false, error: "too_many_open" };
  if (Q.pendingPair.get(since, fromUid, to.user_id, to.user_id, fromUid)) return { ok: false, error: "already_open" };
  const r = Q.insert.run(fromUid, to.user_id, JSON.stringify(give), JSON.stringify(get), now(), now());
  return { ok: true, id: Number(r.lastInsertRowid), to };
}

function moveOne(sp, fromUid, toUid) {
  Q.moveSpecimen.run(toUid, sp.id, fromUid);
  db.q.decCatch.run(fromUid, sp.deviation, sp.variant);
  db.q.dropEmptyCatch.run(fromUid, sp.deviation, sp.variant);
  db.q.addCatch.run(toUid, sp.deviation, sp.variant, kindOf(sp.deviation, sp.variant), now(), "trade");
}

// The receiver accepts: re-check everything, then swap in one transaction.
function accept(uid, tradeId) {
  const t = Q.get.get(Number(tradeId));
  if (!t || t.to_user !== uid) return { ok: false, error: "not_found" };
  if (!live(t)) return { ok: false, error: t.status === "pending" ? "expired" : "closed" };
  const give = JSON.parse(t.give), get = JSON.parse(t.get);
  const fail = (error) => { Q.setStatus.run("failed", error, now(), t.id); return { ok: false, error }; };
  const gSpecs = give.map((id) => db.q.getSpecimen.get(id, t.from_user));
  const wSpecs = get.map((id) => db.q.getSpecimen.get(id, t.to_user));
  if (gSpecs.some((x) => !x) || wSpecs.some((x) => !x)) return fail("gone");
  const A = db.q.getPlayer.get(t.from_user), B = db.q.getPlayer.get(t.to_user);
  const pa = game.loadPlayer(A.user_id, A.login, A.display), pb = game.loadPlayer(B.user_id, B.login, B.display);
  // pods: each side ends with (used - given + received) — must fit their cap
  if (game.podsUsed(pa) - give.length + get.length > game.unitCap(pa)) return { ok: false, error: "sender_full" };
  if (game.podsUsed(pb) - get.length + give.length > game.unitCap(pb)) return { ok: false, error: "you_full" };
  db.tx(() => {
    for (const sp of gSpecs) moveOne(sp, t.from_user, t.to_user);
    for (const sp of wSpecs) moveOne(sp, t.to_user, t.from_user);
    Q.setStatus.run("accepted", null, now(), t.id);
  })();
  // any other open offers that included these specimens can't happen any more
  return { ok: true, trade: t, gave: wSpecs, got: gSpecs };
}

function decline(uid, tradeId) {
  const t = Q.get.get(Number(tradeId));
  if (!t || t.to_user !== uid) return { ok: false, error: "not_found" };
  if (t.status !== "pending") return { ok: false, error: "closed" };
  Q.setStatus.run("declined", null, now(), t.id);
  return { ok: true };
}

function cancel(uid, tradeId) {
  const t = Q.get.get(Number(tradeId));
  if (!t || t.from_user !== uid) return { ok: false, error: "not_found" };
  if (t.status !== "pending") return { ok: false, error: "closed" };
  Q.setStatus.run("cancelled", null, now(), t.id);
  return { ok: true };
}

// everything the trades page needs, with specimens resolved for display
function listFor(uid) {
  const spec = (id, owner) => db.q.getSpecimen.get(id, owner) || null;
  return Q.forUser.all(uid, uid).map((t) => {
    const state = t.status === "pending" && !live(t) ? "expired" : t.status;
    const fromP = db.q.getPlayer.get(t.from_user), toP = db.q.getPlayer.get(t.to_user);
    const done = t.status === "accepted";
    // after an accepted trade the specimens belong to the other side
    const give = JSON.parse(t.give).map((id) => ({ id, sp: spec(id, done ? t.to_user : t.from_user) }));
    const get = JSON.parse(t.get).map((id) => ({ id, sp: spec(id, done ? t.from_user : t.to_user) }));
    return { ...t, state, incoming: t.to_user === uid, from: fromP, to: toP, give, get };
  });
}

const pendingCount = (uid) => Q.pendingIn.get(uid, now() - EXPIRE_MS).n;

const ERR = {
  not_player: "You need to play first — type !secure in chat when a deviation shows up.",
  no_such_player: "No player with that name has played Deviation Hunt yet.",
  self: "You can't trade with yourself.",
  empty: "Pick at least one of yours and one of theirs.",
  too_many: `Up to ${MAX_PER_SIDE} deviations on each side.`,
  not_yours: "One of the deviations you picked isn't yours any more.",
  not_theirs: "One of the deviations you asked for isn't theirs any more.",
  too_many_open: `You already have ${MAX_OPEN_OUT} offers waiting. Cancel one first.`,
  already_open: "There's already an open trade between you two — finish or cancel it first.",
  not_found: "That trade wasn't found.",
  closed: "That trade is already finished.",
  expired: "That trade offer expired.",
  gone: "One of the deviations in this trade was scrapped or traded away, so the trade was cancelled.",
  sender_full: "The other player's Securement Pods are too full for this trade right now.",
  you_full: "Your Securement Pods are too full for this trade. Scrap some extras first.",
};

module.exports = { create, accept, decline, cancel, listFor, pendingCount, ERR, MAX_PER_SIDE, EXPIRE_MS };
