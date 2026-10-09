// blocklist.js — Twitch accounts banned from Deviation Hunt (B 2026-10-09: auravella).
// A blocked account is wiped from the game on every start (player, collection, channel, stats) and can't come back:
// the bot ignores their chat commands, won't join their channel, and the website / panel refuse them.
// Add more with the Railway env BLOCKED_LOGINS="name1,name2" (these defaults always stay blocked).
const db = require("./db");

const DEFAULT = ["auravella"];
const logins = new Set([...DEFAULT, ...String(process.env.BLOCKED_LOGINS || "").toLowerCase().split(/[\s,]+/).filter(Boolean)]);
// Channels that may never ADD the game (B 2026-10-09: nobles_tv). They can still play in other streams.
// More via Railway env NO_CHANNEL_LOGINS="name1,name2".
const noChannel = new Set(["nobles_tv", ...String(process.env.NO_CHANNEL_LOGINS || "").toLowerCase().split(/[\s,]+/).filter(Boolean)]);
const noChannelIds = new Set(JSON.parse(db.getSetting("nochannel:ids") || "[]"));
function isChannelBlocked(userId, login) {
  if (isBlocked(userId, login)) return true;
  if (userId && noChannelIds.has(String(userId))) return true;
  if (login && noChannel.has(String(login).toLowerCase())) { if (userId && !noChannelIds.has(String(userId))) { noChannelIds.add(String(userId)); db.q.setSetting.run("nochannel:ids", JSON.stringify([...noChannelIds])); } return true; }
  return false;
}
// Twitch user ids we've seen for them, so a renamed account stays blocked too
const ids = new Set(JSON.parse(db.getSetting("blocked:ids") || "[]"));
const saveIds = () => db.q.setSetting.run("blocked:ids", JSON.stringify([...ids]));

function isBlocked(userId, login) {
  if (userId && ids.has(String(userId))) return true;
  if (login && logins.has(String(login).toLowerCase())) { if (userId && !ids.has(String(userId))) { ids.add(String(userId)); saveIds(); } return true; }
  return false;
}

// Remove everything the game knows about each blocked account. Returns the channel ids the bot should leave.
function purge() {
  const R = db.raw, leave = [];
  for (const login of logins) {
    const p = R.prepare(`SELECT user_id FROM players WHERE lower(login)=?`).get(login);
    const c = R.prepare(`SELECT broadcaster_id FROM channels WHERE lower(login)=?`).get(login);
    for (const id of [p?.user_id, c?.broadcaster_id]) if (id) ids.add(String(id));
  }
  for (const id of ids) {
    const had = R.prepare(`SELECT (SELECT COUNT(*) FROM players WHERE user_id=?) + (SELECT COUNT(*) FROM channels WHERE broadcaster_id=?) AS n`).get(id, id).n;
    if (!had) continue;
    db.tx(() => {
      for (const t of ["players", "catches", "specimens", "daily_claims", "bits_tx"]) R.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(id);
      R.prepare(`DELETE FROM channels WHERE broadcaster_id=?`).run(id);
      R.prepare(`DELETE FROM spawn_log WHERE broadcaster_id=?`).run(id);
      R.prepare(`DELETE FROM active_spawns WHERE broadcaster_id=?`).run(id);
      R.prepare(`DELETE FROM settings WHERE key LIKE ?`).run(`%:${id}`);
      // other players' catches made in their channel stay with those players, but no longer name the channel
      R.prepare(`UPDATE specimens SET channel=NULL WHERE channel=?`).run(id);
      R.prepare(`UPDATE catches SET first_channel=NULL WHERE first_channel=?`).run(id);
    })();
    console.log(`[blocklist] removed blocked account ${id} from the game`);
    leave.push(id);
  }
  saveIds();
  // channel-blocked streamers: if the game is in their channel, take it out (their own player stays)
  for (const login of noChannel) {
    const c = R.prepare(`SELECT broadcaster_id FROM channels WHERE lower(login)=?`).get(login);
    if (c) noChannelIds.add(String(c.broadcaster_id));
  }
  db.q.setSetting.run("nochannel:ids", JSON.stringify([...noChannelIds]));
  for (const id of noChannelIds) {
    if (!R.prepare(`SELECT 1 FROM channels WHERE broadcaster_id=?`).get(id)) continue;
    R.prepare(`DELETE FROM channels WHERE broadcaster_id=?`).run(id);
    R.prepare(`DELETE FROM active_spawns WHERE broadcaster_id=?`).run(id);
    console.log(`[blocklist] removed the game from channel ${id} (not allowed to add it)`);
    leave.push(id);
  }
  return leave;
}

module.exports = { isBlocked, isChannelBlocked, purge, logins, ids: () => [...ids, ...noChannelIds] };
