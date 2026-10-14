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
// may this player see the packs / get credit for a receipt?
const allowedFor = (login) => live() || isOwnerLogin(login);
function sync() { rarity.setBitsLive(live()); return live(); }
function setLive(on) {
  db.setSetting("bits:enabled", on ? "on" : "off");
  const now = sync();
  console.log(`[bits] switched ${now ? "ON" : "OFF"}${cfg.BITS_ENABLED ? " (env BITS_ENABLED=1 keeps it on)" : ""}`);
  return now;
}
sync();

module.exports = { live, allowedFor, setLive, sync, isOwnerLogin };
