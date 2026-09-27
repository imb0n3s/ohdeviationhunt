// db.js — SQLite: joined channels, the bot account, and the game (players, units, collections)
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const cfg = require("./config");

fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
const db = new Database(path.join(cfg.DATA_DIR, "deviation-hunt.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS channels (
  broadcaster_id TEXT PRIMARY KEY,
  login          TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  joined_at      INTEGER NOT NULL,
  joined_via     TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  spawns_on      INTEGER NOT NULL DEFAULT 1,
  interval_min   INTEGER,
  spawns         INTEGER NOT NULL DEFAULT 0,
  catches        INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bot_account (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  user_id       TEXT NOT NULL,
  login         TEXT NOT NULL,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

-- players are global (by Twitch user id), like PCG: your collection follows you to every channel
CREATE TABLE IF NOT EXISTS players (
  user_id     TEXT PRIMARY KEY,
  login       TEXT NOT NULL,
  display     TEXT NOT NULL,
  starchrom   INTEGER NOT NULL DEFAULT 0,
  units       TEXT NOT NULL DEFAULT '{}',   -- JSON { standard: n, advanced: n, ... }
  last_daily  INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_login ON players(login);

-- one row per (player, deviation, variant). variant '' = base form
CREATE TABLE IF NOT EXISTS catches (
  user_id      TEXT NOT NULL,
  deviation    TEXT NOT NULL,
  variant      TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'base',  -- base | variation | skin
  count        INTEGER NOT NULL DEFAULT 1,
  first_at     INTEGER NOT NULL,
  first_channel TEXT,
  PRIMARY KEY (user_id, deviation, variant)
);

-- every secured deviation is its own specimen with Deviant Power / Mood ratings (1-5)
-- and three traits that follow the wiki's Deviation Trait Page
CREATE TABLE IF NOT EXISTS specimens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  deviation   TEXT NOT NULL,
  variant     TEXT NOT NULL DEFAULT '',
  power       INTEGER NOT NULL,
  mood        INTEGER NOT NULL,
  t1          TEXT, t1_level INTEGER,
  t2          TEXT,
  t3          TEXT,
  caught_at   INTEGER NOT NULL,
  channel     TEXT
);
CREATE INDEX IF NOT EXISTS specimens_user ON specimens(user_id, deviation, variant);

-- deviations currently loose in chat, so a restart/redeploy doesn't lose them
CREATE TABLE IF NOT EXISTS active_spawns (
  broadcaster_id TEXT PRIMARY KEY,
  data           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spawn_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,
  broadcaster_id TEXT NOT NULL,
  deviation      TEXT NOT NULL,
  variant        TEXT NOT NULL DEFAULT '',
  attempts       INTEGER NOT NULL DEFAULT 0,
  caught         INTEGER NOT NULL DEFAULT 0
);
`);

// migrations for columns added after launch
try { db.exec(`ALTER TABLE players ADD COLUMN last_unit_at INTEGER NOT NULL DEFAULT 0`); } catch {}
// existing players start their hourly-unit clock now (no back-pay for the past)
db.prepare(`UPDATE players SET last_unit_at=? WHERE last_unit_at=0`).run(Date.now());

const q = {
  upsertChannel: db.prepare(`INSERT INTO channels (broadcaster_id, login, display_name, joined_at, joined_via, enabled)
    VALUES (@broadcaster_id, @login, @display_name, @joined_at, @joined_via, 1)
    ON CONFLICT(broadcaster_id) DO UPDATE SET login=excluded.login, display_name=excluded.display_name, enabled=1`),
  disableChannel: db.prepare(`UPDATE channels SET enabled=0 WHERE broadcaster_id=?`),
  getChannel: db.prepare(`SELECT * FROM channels WHERE broadcaster_id=?`),
  getChannelByLogin: db.prepare(`SELECT * FROM channels WHERE login=?`),
  listEnabled: db.prepare(`SELECT * FROM channels WHERE enabled=1 ORDER BY joined_at`),
  countEnabled: db.prepare(`SELECT COUNT(*) AS n FROM channels WHERE enabled=1`),
  setInterval: db.prepare(`UPDATE channels SET interval_min=? WHERE broadcaster_id=?`),
  setSpawnsOn: db.prepare(`UPDATE channels SET spawns_on=? WHERE broadcaster_id=?`),
  bumpChannel: db.prepare(`UPDATE channels SET spawns=spawns+1, catches=catches+? WHERE broadcaster_id=?`),

  getBot: db.prepare(`SELECT * FROM bot_account WHERE id=1`),
  saveBot: db.prepare(`INSERT INTO bot_account (id, user_id, login, access_token, refresh_token, expires_at)
    VALUES (1, @user_id, @login, @access_token, @refresh_token, @expires_at)
    ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, login=excluded.login, access_token=excluded.access_token,
      refresh_token=excluded.refresh_token, expires_at=excluded.expires_at`),
  getSetting: db.prepare(`SELECT value FROM settings WHERE key=?`),
  setSetting: db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`),

  getPlayer: db.prepare(`SELECT * FROM players WHERE user_id=?`),
  getPlayerByLogin: db.prepare(`SELECT * FROM players WHERE login=?`),
  insertPlayer: db.prepare(`INSERT INTO players (user_id, login, display, starchrom, units, created_at, last_unit_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  touchPlayer: db.prepare(`UPDATE players SET login=?, display=? WHERE user_id=?`),
  savePlayer: db.prepare(`UPDATE players SET starchrom=@starchrom, units=@units, last_daily=@last_daily, attempts=@attempts, last_unit_at=@last_unit_at WHERE user_id=@user_id`),
  countPlayers: db.prepare(`SELECT COUNT(*) AS n FROM players`),

  addCatch: db.prepare(`INSERT INTO catches (user_id, deviation, variant, kind, count, first_at, first_channel) VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(user_id, deviation, variant) DO UPDATE SET count=count+1`),
  getCatch: db.prepare(`SELECT * FROM catches WHERE user_id=? AND deviation=? AND variant=?`),
  listCatches: db.prepare(`SELECT * FROM catches WHERE user_id=? ORDER BY deviation, variant`),
  dupes: db.prepare(`SELECT * FROM catches WHERE user_id=? AND count>1`),
  trimDupe: db.prepare(`UPDATE catches SET count=1 WHERE user_id=? AND deviation=? AND variant=?`),
  totalCatches: db.prepare(`SELECT COALESCE(SUM(count),0) AS n FROM catches`),
  leaderboard: db.prepare(`SELECT p.user_id, p.display, p.login,
      COUNT(DISTINCT c.deviation) AS species,
      SUM(CASE WHEN c.variant<>'' THEN 1 ELSE 0 END) AS variants,
      COALESCE(SUM(c.count),0) AS total
    FROM players p JOIN catches c ON c.user_id=p.user_id
    GROUP BY p.user_id ORDER BY species DESC, variants DESC, total DESC LIMIT ?`),

  addSpecimen: db.prepare(`INSERT INTO specimens (user_id, deviation, variant, power, mood, t1, t1_level, t2, t3, caught_at, channel)
    VALUES (@user_id, @deviation, @variant, @power, @mood, @t1, @t1_level, @t2, @t3, @caught_at, @channel)`),
  // best = highest Power+Mood, then Power, then newest
  specimensOf: db.prepare(`SELECT * FROM specimens WHERE user_id=? AND deviation=? ORDER BY (power+mood) DESC, power DESC, id DESC`),
  userSpecimens: db.prepare(`SELECT * FROM specimens WHERE user_id=? ORDER BY deviation, variant, (power+mood) DESC, power DESC, id DESC`),
  latestSpecimen: db.prepare(`SELECT * FROM specimens WHERE user_id=? ORDER BY id DESC LIMIT 1`),
  deleteSpecimen: db.prepare(`DELETE FROM specimens WHERE id=?`),
  saveActive: db.prepare(`INSERT INTO active_spawns (broadcaster_id, data) VALUES (?, ?) ON CONFLICT(broadcaster_id) DO UPDATE SET data=excluded.data`),
  deleteActive: db.prepare(`DELETE FROM active_spawns WHERE broadcaster_id=?`),
  listActive: db.prepare(`SELECT * FROM active_spawns`),
  logSpawn: db.prepare(`INSERT INTO spawn_log (ts, broadcaster_id, deviation, variant, attempts, caught) VALUES (?, ?, ?, ?, ?, ?)`),
  totalSpawns: db.prepare(`SELECT COUNT(*) AS n FROM spawn_log`),
};

module.exports = {
  raw: db,
  tx: (fn) => db.transaction(fn),
  // channels
  addChannel: (c) => q.upsertChannel.run({ joined_at: Date.now(), ...c }),
  removeChannel: (id) => q.disableChannel.run(id),
  getChannel: (id) => q.getChannel.get(id),
  getChannelByLogin: (login) => q.getChannelByLogin.get(String(login).toLowerCase()),
  listEnabledChannels: () => q.listEnabled.all(),
  countChannels: () => q.countEnabled.get().n,
  setSpawnInterval: (id, m) => q.setInterval.run(m, id),
  setSpawnsOn: (id, on) => q.setSpawnsOn.run(on ? 1 : 0, id),
  bumpChannel: (id, caught) => q.bumpChannel.run(caught, id),
  // bot
  getBotAccount: () => q.getBot.get(),
  saveBotAccount: (b) => q.saveBot.run(b),
  getSetting: (k) => q.getSetting.get(k)?.value ?? null,
  setSetting: (k, v) => q.setSetting.run(k, v),
  // players
  q,
  countPlayers: () => q.countPlayers.get().n,
  totalCatches: () => q.totalCatches.get().n,
  totalSpawns: () => q.totalSpawns.get().n,
  leaderboard: (n = 10) => q.leaderboard.all(n),
  logSpawn: (bid, dev, variant, attempts, caught) => q.logSpawn.run(Date.now(), bid, dev, variant || "", attempts, caught),
};
