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
  SESSION_SECRET: process.env.SESSION_SECRET || req("ADMIN_KEY"),
  DATA_DIR: process.env.DATA_DIR || "./data",
  BOT_NAME: process.env.BOT_NAME || "Deviation Hunt",
  WIKI_BASE: process.env.WIKI_BASE || "https://ohwikiguide.com",
  DEVIATION_PAGE: process.env.DEVIATION_PAGE || "Deviation_Main_Page",

  // Spawns
  SPAWN_INTERVAL_MIN: Number(process.env.SPAWN_INTERVAL_MIN || 10),  // default per channel; mods can change it
  SPAWN_WINDOW_SECONDS: Number(process.env.SPAWN_WINDOW_SECONDS || 90),
  ACTIVITY_WINDOW_MIN: Number(process.env.ACTIVITY_WINDOW_MIN || 10), // someone must have chatted this recently
  LIVE_POLL_SECONDS: Number(process.env.LIVE_POLL_SECONDS || 120),
  SPAWN_OFFLINE: process.env.SPAWN_OFFLINE === "1",                    // testing only: spawn even when not live

  TERMS_URL: process.env.TERMS_URL || "https://ohwikiguide.com/OH_Wiki_Bot_Terms_of_Service",
  PRIVACY_URL: process.env.PRIVACY_URL || "https://ohwikiguide.com/Privacy_Policy",
  DISCORD_URL: process.env.DISCORD_URL || "https://discord.gg/FZtkXeGeUA",
};
module.exports = cfg;
