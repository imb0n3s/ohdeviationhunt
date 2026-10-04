require("dotenv").config();

function req(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing required env var ${name} (see .env.example)`); process.exit(1); }
  return v;
}

const cfg = {
  PORT: Number(process.env.PORT || 3000),
  BASE_URL: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ""),
  TWITCH_CLIENT_ID: req("TWITCH_CLIENT_ID"),
  TWITCH_CLIENT_SECRET: req("TWITCH_CLIENT_SECRET"),
  ADMIN_KEY: req("ADMIN_KEY"),
  // Twitch logins that can see every trade and reverse them on /trade/admin (comma separated)
  OWNER_LOGINS: (process.env.OWNER_LOGINS || "imbon3s").toLowerCase().split(/[\s,]+/).filter(Boolean),
  SESSION_SECRET: process.env.SESSION_SECRET || req("ADMIN_KEY"),
  DATA_DIR: process.env.DATA_DIR || "./data",
  BOT_NAME: process.env.BOT_NAME || "Deviation Hunt",
  WIKI_BASE: process.env.WIKI_BASE || "https://ohwikiguide.com",
  DEVIATION_PAGE: process.env.DEVIATION_PAGE || "Deviation_Main_Page",

  // Spawns
  SPAWN_INTERVAL_MIN: Number(process.env.SPAWN_INTERVAL_MIN || 7),  // default per channel; mods can change it
  SPAWN_WINDOW_SECONDS: Number(process.env.SPAWN_WINDOW_SECONDS || 90),
  // when a channel uses the OBS Source, hold the "SECURED!/got away" chat message this long so it
  // lands after viewers see the result on stream (stream delay + overlay poll); mods: !hunt chatdelay
  RESULT_CHAT_DELAY_SECONDS: Number(process.env.RESULT_CHAT_DELAY_SECONDS || 14),
  ACTIVITY_WINDOW_MIN: Number(process.env.ACTIVITY_WINDOW_MIN || 10), // someone must have chatted this recently
  LIVE_POLL_SECONDS: Number(process.env.LIVE_POLL_SECONDS || 60),
  SPAWN_OFFLINE: process.env.SPAWN_OFFLINE === "1",
  // PAUSED=1 stops all spawns and game commands (only !join/!leave and a "paused" note on !hunt)
  PAUSED: process.env.PAUSED === "1",
  // Bits purchases stay OFF until the extension is approved/released (B's call). Set BITS_ENABLED=1 on Railway to allow them.
  BITS_ENABLED: process.env.BITS_ENABLED === "1",
  // Twitch extension (Securement Pods panel): the extension secret from the dev console, base64
  // one or more extension secrets (comma/space separated) so key rotation never breaks the panel
  EXT_SECRETS: (process.env.EXT_SECRET || "").split(/[\s,]+/).map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean),

  TERMS_URL: process.env.TERMS_URL || "https://ohwikiguide.com/OH_Wiki_Bot_Terms_of_Service",
  PRIVACY_URL: process.env.PRIVACY_URL || "https://ohwikiguide.com/Deviation_Hunt_Privacy",
  DISCORD_URL: process.env.DISCORD_URL || "https://discord.gg/FZtkXeGeUA",
};
module.exports = cfg;
