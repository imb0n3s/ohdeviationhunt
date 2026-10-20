// bits.js — is buying with Bits switched on? (B 2026-10-14: switch it on at launch with NO restart)
// On when Railway env BITS_ENABLED=1 OR the owner flipped it on at /admin/bits (setting "bits:enabled").
// While it's off, only owners (config OWNER_LOGINS) see and can use the Bits packs, so B can test 0.0.2 in
// Hosted Test (Twitch makes test purchases free, so nobody else may get credit from them).
// Switching on also raises the glove prices (rarity.js setBitsLive).
const cfg = require("./config");
const db = require("./db");
const rarity = require("./rarity");

const live = () => cfg.BITS_ENABLED || db.getSetting("bits:enabled") === "on";
const isOwnerLogin = (login) => cfg.OWNER_LOGINS.includes(String(login || "").toLowerCase());
// Review mode (B 2026-10-20): Twitch reviewers must see the Bits Shop and receive what they buy. While it's on, everyone
// who opens a Bits-capable panel (only 0.0.2 — the released 0.0.1 panel can't use Bits) gets the packs and credit, but
// glove prices DON'T rise. Safe only while 0.0.2's tester list is just the owner. Turned off by switching Bits live.
const review = () => db.getSetting("bits:review") === "on";
function setReview(on) { db.setSetting("bits:review", on ? "on" : "off"); console.log(`[bits] review mode ${on ? "ON" : "OFF"}`); return review(); }
// may this player see the packs / get credit for a receipt?
const allowedFor = (login) => live() || review() || isOwnerLogin(login);
function sync() { rarity.setBitsLive(live()); return live(); }
function setLive(on) {
  db.setSetting("bits:enabled", on ? "on" : "off");
  if (on) db.setSetting("bits:review", "off");
  const now = sync();
  console.log(`[bits] switched ${now ? "ON" : "OFF"}${cfg.BITS_ENABLED ? " (env BITS_ENABLED=1 keeps it on)" : ""}`);
  return now;
}
sync();

module.exports = { live, review, setReview, allowedFor, setLive, sync, isOwnerLogin };
