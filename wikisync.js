// wikisync.js — after each deploy, rebuild the player guide (scripts/wiki-page.js) and publish it to
// https://ohwikiguide.com/Deviation_Hunt, so the wiki always matches the live bot without anyone
// opening a browser. Needs a MediaWiki *bot password* in Railway env (Special:BotPasswords on the wiki):
//   WIKI_BOT_USER = "<WikiUser>@<botname>"   WIKI_BOT_PASS = "<the generated password>"
// Unset = off. Only edits when the text actually changed.
const { execFile } = require("child_process");
const path = require("path");

const API = process.env.WIKI_API || "https://ohwikiguide.com/api.php";
const TITLE = process.env.WIKI_PAGE || "Deviation_Hunt";

function buildText() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(__dirname, "scripts", "wiki-page.js")], { cwd: __dirname, maxBuffer: 8e6 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

// tiny cookie jar so the login session carries across requests
function client() {
  const jar = new Map();
  return async (params, post) => {
    const url = post ? API : `${API}?${new URLSearchParams({ ...params, format: "json" })}`;
    const res = await fetch(url, {
      method: post ? "POST" : "GET",
      headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), "user-agent": "DeviationHunt-wikisync/1.0", ...(post ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      body: post ? new URLSearchParams({ ...params, format: "json" }) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return res.json();
  };
}

async function syncWiki() {
  const user = process.env.WIKI_BOT_USER, pass = process.env.WIKI_BOT_PASS;
  if (!user || !pass) return { skipped: "no WIKI_BOT_USER/WIKI_BOT_PASS" };
  const text = await buildText();
  if (text.length < 5000) throw new Error(`generated page looks broken (${text.length} chars) — not publishing`);
  const api = client();
  const lt = (await api({ action: "query", meta: "tokens", type: "login" })).query.tokens.logintoken;
  const login = await api({ action: "login", lgname: user, lgpassword: pass, lgtoken: lt }, true);
  if (login.login?.result !== "Success") throw new Error(`wiki login failed: ${login.login?.result} ${login.login?.reason || ""}`);
  const cur = await api({ action: "query", prop: "revisions", titles: TITLE, rvprop: "content", rvslots: "main", formatversion: "2" });
  const old = cur.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (old != null && old.trim() === text.trim()) return { unchanged: true };
  const csrf = (await api({ action: "query", meta: "tokens" })).query.tokens.csrftoken;
  const r = await api({ action: "edit", title: TITLE, text, summary: "Auto-update from the Deviation Hunt bot (matches the live game)", bot: "1", token: csrf }, true);
  if (r.edit?.result !== "Success") throw new Error(`wiki edit failed: ${JSON.stringify(r.error || r).slice(0, 200)}`);
  return { updated: true, rev: r.edit.newrevid };
}

// run once, a little after startup (the deploy has settled), never blocking or crashing the bot
function scheduleWikiSync(delayMs = 30000) {
  setTimeout(() => {
    syncWiki().then((r) => console.log("[wiki] sync", JSON.stringify(r))).catch((e) => console.error("[wiki] sync failed:", e.message));
  }, delayMs).unref?.();
}

module.exports = { syncWiki, scheduleWikiSync, buildText };
