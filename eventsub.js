// eventsub.js — reads chat from every joined channel through an EventSub Conduit.
//
// A conduit is Twitch's "proper bot" transport: subscriptions are made with the
// app token + the streamer's channel:bot grant, they persist server-side across
// restarts, there is no per-socket channel cap, and Twitch lists the account
// under "Chat Bots" in the viewer list. We attach one WebSocket shard to it.
const WebSocket = require("ws");
const twitch = require("./twitch");
const db = require("./db");

const WS_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";

class Conduit {
  constructor(onChat) {
    this.onChat = onChat;
    this.conduitId = null;
    this.subs = new Map(); // broadcaster_id -> subscription id
    this.ws = null;
    this.sessionId = null;
    this.ready = null;
    this.reconnectTimer = null;
  }

  // ---------- setup ----------

  async init() {
    // Reuse an existing conduit for this app if there is one, else create one.
    const list = await twitch.helix("GET", "/eventsub/conduits", { as: "app" });
    const saved = db.getSetting("conduit_id");
    const existing = list.data.find((c) => c.id === saved) || list.data[0];
    if (existing) {
      this.conduitId = existing.id;
    } else {
      const r = await twitch.helix("POST", "/eventsub/conduits", { as: "app", body: { shard_count: 1 } });
      this.conduitId = r.data[0].id;
    }
    db.setSetting("conduit_id", this.conduitId);
    console.log(`[eventsub] conduit ${this.conduitId}`);

    // Remember which channels already have live subscriptions on this conduit.
    let cursor;
    do {
      const r = await twitch.helix("GET", "/eventsub/subscriptions", { as: "app", query: { type: "channel.chat.message", ...(cursor ? { after: cursor } : {}) } });
      for (const s of r.data) {
        if (s.transport.method === "conduit" && s.transport.conduit_id === this.conduitId) {
          if (s.status === "enabled") this.subs.set(s.condition.broadcaster_user_id, s.id);
          else await twitch.helix("DELETE", "/eventsub/subscriptions", { as: "app", query: { id: s.id } }).catch(() => {});
        }
      }
      cursor = r.pagination?.cursor;
    } while (cursor);

    await this.connect();
  }

  connect(url = WS_URL, isReconnect = false) {
    if (!isReconnect) this.ready = new Promise((r) => (this._resolveReady = r));
    const ws = new WebSocket(url);
    ws.on("message", (raw) => this.onMessage(ws, JSON.parse(raw.toString()), isReconnect));
    ws.on("close", (code) => {
      if (ws !== this.ws) return;
      clearTimeout(this.keepTimer);
      console.warn(`[eventsub] socket closed (${code}); reconnecting in 5s`);
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });
    ws.on("error", (e) => console.error("[eventsub] socket error:", e.message));
    if (!isReconnect) this.ws = ws;
    return this.ready;
  }

  armKeepalive(seconds) {
    clearTimeout(this.keepTimer);
    this.keepTimer = setTimeout(() => {
      console.warn("[eventsub] keepalive missed; reconnecting");
      try { this.ws.terminate(); } catch {}
    }, (seconds + 10) * 1000);
  }

  async onMessage(ws, msg, isReconnect) {
    const type = msg.metadata?.message_type;
    if (type === "session_welcome") {
      this.sessionId = msg.payload.session.id;
      this.armKeepalive(msg.payload.session.keepalive_timeout_seconds);
      if (isReconnect) { const old = this.ws; this.ws = ws; try { old.close(); } catch {} }
      else {
        // Point the conduit's single shard at this socket. Subscriptions survive across sessions.
        // Retried (B 2026-10-12: after a redeploy chat went silent — if this PATCH fails once, no chat reaches the bot
        // until the next restart). Twitch can also answer 202 with an error per shard, so check that too.
        let attached = false;
        for (let tries = 1; tries <= 6 && !attached && ws === this.ws; tries++) {
          try {
            const r = await twitch.helix("PATCH", "/eventsub/conduits/shards", { as: "app", body: { conduit_id: this.conduitId, shards: [{ id: "0", transport: { method: "websocket", session_id: this.sessionId } }] } });
            const err = (r && r.errors && r.errors[0]) || null;
            if (err) throw new Error(`${err.code || ""} ${err.message || JSON.stringify(err)}`.trim());
            attached = true;
            console.log(`[eventsub] shard attached, ${this.subs.size} channels live`);
          } catch (e) {
            console.error(`[eventsub] shard update failed (try ${tries}/6):`, e.message);
            await new Promise((res) => setTimeout(res, 3000 * tries));
          }
        }
        if (!attached && ws === this.ws) { console.error("[eventsub] shard never attached — reconnecting the socket"); try { ws.terminate(); } catch {} }
      }
      this._resolveReady?.();
      return;
    }
    if (ws !== this.ws && !isReconnect) return;
    if (type === "session_keepalive") return this.armKeepalive(30);
    if (type === "session_reconnect") return this.connect(msg.payload.session.reconnect_url, true);
    if (type === "revocation") {
      const bid = msg.payload.subscription.condition.broadcaster_user_id;
      const status = msg.payload.subscription.status;
      console.warn(`[eventsub] subscription revoked for ${bid}: ${status}`);
      this.subs.delete(bid);
      // the streamer took the game off their Twitch (revoked the app, unmodded/banned the bot, deleted the account):
      // drop the channel right away so it leaves Where to Play and the leaderboards (B 2026-10-13)
      if (["authorization_revoked", "user_removed", "moderator_removed"].includes(status)) this.onRemoved?.(bid, status);
      return;
    }
    if (type === "notification") {
      this.armKeepalive(30);
      if (msg.metadata.subscription_type === "channel.chat.message") this.onChat(msg.payload.event);
    }
  }

  // ---------- channels ----------

  isJoined(broadcasterId) { return this.subs.has(broadcasterId); }
  get channelCount() { return this.subs.size; }

  async join(broadcasterId) {
    if (this.subs.has(broadcasterId)) return;
    const bot = db.getBotAccount();
    try {
      const r = await twitch.helix("POST", "/eventsub/subscriptions", {
        as: "app",
        body: {
          type: "channel.chat.message", version: "1",
          condition: { broadcaster_user_id: broadcasterId, user_id: bot.user_id },
          transport: { method: "conduit", conduit_id: this.conduitId },
        },
      });
      this.subs.set(broadcasterId, r.data[0].id);
    } catch (e) {
      if (e.status === 409) return; // already subscribed (race) — init() will pick it up next boot
      if (e.status === 403) { const err = new Error("NEEDS_PERMISSION"); err.status = 403; throw err; }
      throw e;
    }
  }

  async leave(broadcasterId) {
    const id = this.subs.get(broadcasterId);
    if (!id) return;
    this.subs.delete(broadcasterId);
    await twitch.helix("DELETE", "/eventsub/subscriptions", { as: "app", query: { id } }).catch((e) => console.error("[eventsub] unsubscribe failed:", e.message));
  }

  // On startup (or right after /setup): make sure every enabled channel is subscribed
  async joinAllFromDb() {
    const bot = db.getBotAccount();
    if (!bot) return console.log("[eventsub] bot account not set up yet — open /setup?key=... in your browser");
    if (!this.conduitId) await this.init();
    const ids = new Set([bot.user_id, ...db.listEnabledChannels().map((c) => c.broadcaster_id)]);
    let ok = 0; const denied = [];
    for (const id of ids) {
      try { await this.join(id); ok++; } catch (e) {
        console.error(`[eventsub] join ${id} failed:`, e.message);
        if (e.message === "NEEDS_PERMISSION" && id !== bot.user_id) denied.push(id);
      }
    }
    console.log(`[eventsub] listening in ${ok}/${ids.size} channels`);
    this.dropDenied(denied, ok);
  }

  // Every few minutes: any enabled channel we're not listening in gets one more try; if Twitch says the game
  // no longer has permission there, the streamer removed it — take the channel off the lists.
  async recheck() {
    const bot = db.getBotAccount();
    if (!bot || !this.conduitId) return;
    const denied = [];
    for (const c of db.listEnabledChannels()) {
      if (c.broadcaster_id === bot.user_id || this.subs.has(c.broadcaster_id)) continue;
      try { await this.join(c.broadcaster_id); console.log(`[eventsub] re-joined ${c.login}`); }
      catch (e) { if (e.message === "NEEDS_PERMISSION") denied.push(c.broadcaster_id); }
    }
    this.dropDenied(denied, this.subs.size);
  }

  // safety: if Twitch refuses lots of channels at once it's an auth problem on OUR side, not streamers leaving
  dropDenied(denied, okCount) {
    if (!denied.length) return;
    if (denied.length > 3 || okCount === 0) return console.error(`[eventsub] ${denied.length} channels refused at once — not removing them (check the bot/app tokens)`);
    for (const id of denied) this.onRemoved?.(id, "needs_permission");
  }
}

module.exports = { Conduit };
