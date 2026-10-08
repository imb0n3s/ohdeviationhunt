// live.js — a full-screen 1920×1080 page made to be streamed 24/7 (e.g. on the OHDeviationHunt channel) so
// people can play any time: /live/<channel login>. It embeds that channel's OBS Source (the deviation card +
// countdown), and around it shows how to play, the next-spawn timer, recent catches and the leaderboards.
// A headless browser + ffmpeg on a small server sends this page to Twitch (see docs/live-stream.md).
const cfg = require("./config");
const db = require("./db");
const data = require("./data");
const overlay = require("./overlay");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const caughtSinceQ = db.raw.prepare(`SELECT COALESCE(SUM(caught),0) AS n FROM spawn_log WHERE broadcaster_id=? AND ts>=?`);
const recentQ = db.raw.prepare(`SELECT s.deviation, s.variant, s.power, s.mood, s.caught_at, p.display, c.display_name AS chan
  FROM specimens s JOIN players p ON p.user_id=s.user_id LEFT JOIN channels c ON c.broadcaster_id=s.channel
  ORDER BY s.caught_at DESC LIMIT ?`);

function liveData(pool, ch) {
  const sp = pool?.spawns;
  const bid = ch.broadcaster_id;
  const active = sp?.active?.get(bid);
  const last = sp?.lastResult?.get(bid);
  // the OBS Source shows "who caught it" for a while after a spawn ends — keep the idle timer hidden meanwhile
  const showingResult = !!(last && last.winners?.length && Date.now() - last.at < Math.max(15000, (sp?.chatDelayMs?.(bid) || 0) + 9000));
  const now = Date.now();
  const idleChat = !sp?.alwaysOn?.(bid) && now - (sp?.lastChat?.get(bid) || 0) > cfg.ACTIVITY_WINDOW_MIN * 60 * 1000;
  const recent = recentQ.all(8).map((r) => {
    const d = data.get(r.deviation);
    const v = r.variant ? d?.variants.find((x) => x.name === r.variant) : null;
    return { name: d?.name || r.deviation, img: (v && v.img) || d?.img || "", variant: r.variant || "", kind: v?.kind || "", who: r.display, chan: r.chan || "", rating: `${r.power}/${r.mood}`, at: r.caught_at };
  });
  return {
    now,
    live: !!sp?.live?.has(bid),
    spawnsOn: !!ch.spawns_on,
    active: !!active || showingResult,
    nextAt: sp?.nextAt?.get(bid) || null,
    idleChat,
    recent,
    metas: db.leaderboard(5, "all").map((r) => ({ name: r.display, species: r.species, total: r.total })),
    streams: db.topStreams(3).map((c) => ({ name: c.display_name, catches: c.catches })),
    totalDevs: data.all().length,
    // bottom ticker: the other channels live with the game right now, and what's been secured there
    liveNow: db.listEnabledChannels().filter((c) => c.broadcaster_id !== bid && sp?.live?.has(c.broadcaster_id)).map((c) => {
      const info = sp?.streamInfo?.get(c.broadcaster_id) || {};
      return { name: c.display_name, login: c.login, total: c.catches || 0, viewers: info.viewers || 0,
        stream: info.startedAt ? caughtSinceQ.get(c.broadcaster_id, info.startedAt).n : null };
    }).sort((a, b) => b.viewers - a.viewers || b.total - a.total),
    v: overlay.BOOT,           // changes on every server start: the page reloads itself to pick up updates
  };
}

function page(ch) {
  const obs = `/obs-source/${overlay.codeFor(ch.broadcaster_id)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Deviation Hunt — Live</title>
<link href="https://fonts.googleapis.com/css2?family=Black+Ops+One&display=block" rel="stylesheet">
<style>
:root{--gold:#f2c034;--cyan:#22d3ee;--text:#e6edf5;--muted:#94a3b8;--card:rgba(11,21,25,.82);--line:rgba(34,211,238,.28)}
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#05080a;color:var(--text);font-family:"Segoe UI",system-ui,"Noto Sans",sans-serif}
#bg{position:absolute;inset:0;background:radial-gradient(900px 700px at 32% 48%,rgba(34,211,238,.20),transparent 65%),radial-gradient(800px 600px at 95% 100%,rgba(242,192,52,.08),transparent 60%),linear-gradient(135deg,#132a33,#070d10 60%,#040607)}
.dust{position:absolute;width:4px;height:4px;border-radius:50%;background:#7ee8fa;opacity:.5;animation:float 18s linear infinite}
@keyframes float{from{transform:translateY(40px)}to{transform:translateY(-120px)}}
.stencil{font-family:"Black Ops One",Impact,sans-serif;background:linear-gradient(#fff1b8,#f2c034 45%,#9a5b07);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 #0b1416) drop-shadow(0 6px 10px rgba(0,0,0,.7))}
header{position:absolute;left:48px;top:36px;display:flex;align-items:center;gap:22px}
header img{width:112px;height:112px;border-radius:50%;box-shadow:0 0 0 3px var(--line),0 10px 30px rgba(0,0,0,.6)}
header .t{font-size:64px;line-height:1}
header .s{font-size:24px;color:#cbd5e1;font-weight:600;margin-top:6px}
.badge{display:inline-block;background:#e11d48;color:#fff;font-weight:900;font-size:18px;letter-spacing:2px;padding:4px 12px;border-radius:6px;margin-right:10px;vertical-align:middle}
/* stage with the OBS Source */
#stage{position:absolute;left:48px;top:170px;width:1150px;height:778px;border-radius:24px;border:2px solid var(--line);background:radial-gradient(circle at 50% 45%,rgba(34,211,238,.12),rgba(5,8,10,.6) 70%);overflow:hidden}
#stage iframe{position:absolute;left:50%;top:50%;width:600px;height:600px;border:0;transform:translate(-50%,-50%) scale(1.3);background:transparent}
#idle{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transition:opacity .5s}
#idle.hide{opacity:0}
#idle .ring{width:380px;height:380px;border-radius:50%;border:12px dashed rgba(34,211,238,.55);display:flex;align-items:center;justify-content:center;animation:spin 30s linear infinite;box-shadow:0 0 40px rgba(34,211,238,.25) inset,0 0 40px rgba(34,211,238,.2)}
#idle .ring > div{animation:spin 30s linear infinite reverse}
@keyframes spin{to{transform:rotate(360deg)}}
#idle .lbl{font-size:21px;color:#cbd5e1;font-weight:700;letter-spacing:2px;text-transform:uppercase}
#idle .big{font-size:96px;margin-top:6px}
#idle .msg{margin-top:34px;font-size:34px;font-weight:700;max-width:860px}
#idle .msg b{color:var(--cyan)}
/* right column */
#side{position:absolute;left:1230px;top:36px;width:642px;height:912px;display:flex;flex-direction:column;gap:18px}
.card{background:var(--card);border:2px solid var(--line);border-radius:20px;padding:18px 22px}
.card h2{margin:0 0 10px;font-size:30px;font-weight:400}
.how{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:24px;align-items:center}
.how kbd{font-family:inherit;font-weight:900;color:#04121c;background:var(--cyan);border-radius:8px;padding:2px 12px;font-size:24px;white-space:nowrap}
.rec{display:flex;flex-direction:column;gap:8px}
.r{display:flex;align-items:center;gap:12px;font-size:21px;animation:in .5s}
.r img{width:48px;height:48px;object-fit:contain;flex:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.6))}
.r .n{font-weight:800}.r .v{color:#fde68a;font-weight:800}.r .w{color:var(--muted);font-size:18px}
.r .rt{margin-left:auto;color:#fde68a;font-weight:800}
@keyframes in{from{opacity:0;transform:translateX(16px)}}
.lb{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.lb ol{margin:0;padding-left:30px;font-size:22px;line-height:1.55}.lb ol b{color:var(--cyan)}.lb li span{color:var(--muted);font-size:18px}
footer{position:absolute;left:48px;right:48px;bottom:20px;height:0}
/* bottom ticker: who else is live with the game */
#ticker{position:absolute;left:0;right:0;bottom:0;height:78px;display:flex;align-items:center;background:linear-gradient(90deg,rgba(4,8,10,.96),rgba(11,21,25,.94));border-top:2px solid var(--line);overflow:hidden}
#ticker .lab{flex:none;height:100%;display:flex;align-items:center;gap:10px;padding:0 26px;background:#e11d48;color:#fff;font-weight:900;font-size:24px;letter-spacing:2px;box-shadow:12px 0 24px rgba(0,0,0,.6);z-index:1}
#ticker .lab i{width:12px;height:12px;border-radius:50%;background:#fff;animation:blink2 1.2s infinite}
@keyframes blink2{50%{opacity:.25}}
#ticker .win{flex:1;overflow:hidden;height:100%;position:relative}
#ticker .run{position:absolute;top:0;left:0;height:100%;display:flex;align-items:center;white-space:nowrap;will-change:transform}
#ticker .it{font-size:28px;font-weight:700;color:#e6edf5;padding:0 34px;display:flex;align-items:center;gap:12px}
#ticker .it b{color:var(--cyan)}#ticker .it .c{color:#fde68a;font-weight:800}#ticker .it .m{color:var(--muted);font-size:22px}
#ticker .sep{color:var(--gold);font-size:22px}
</style></head><body>
<div id="bg"></div>
<header><img src="/panel/dh-logo.png" alt="">
  <div><div class="t stencil">Deviation Hunt</div><div class="s"><span class="badge">24/7</span>Catch Once Human deviations right here in chat</div></div></header>

<div id="stage">
  <!-- the countdown version of the OBS Source: countdown ring → deviation card → who caught it → countdown -->
  <iframe src="${esc(obs)}?countdown=1" allowtransparency="true" scrolling="no"></iframe>
</div>

<div id="side">
  <div class="card"><h2 class="stencil">How to Play</h2><div class="how">
    <kbd>!secure</kbd><div>catch the deviation on screen</div>
    <kbd>!daily</kbd><div>free Starchrom + Securement Units</div>
    <kbd>!hourly</kbd><div>free unit + Starchrom every hour</div>
    <kbd>!pods</kbd><div>your collection</div>
    <kbd>!shop</kbd><div>units, Capture Soup &amp; gloves</div></div></div>
  <div class="card" style="flex:1;overflow:hidden"><h2 class="stencil">Recent Catches</h2><div class="rec" id="rec"></div></div>
  <div class="card"><div class="lb">
    <div><h2 class="stencil">Top Metas</h2><ol id="metas"></ol></div>
    <div><h2 class="stencil">Top Streams</h2><ol id="streams"></ol></div></div></div>
</div>
<div id="ticker"><div class="lab"><i></i>LIVE NOW</div><div class="win"><div class="run" id="run"></div></div></div>

<script>
(function(){
  for(let i=0;i<26;i++){const d=document.createElement("div");d.className="dust";d.style.left=Math.random()*1920+"px";d.style.top=Math.random()*1080+"px";d.style.animationDelay=(-Math.random()*18)+"s";d.style.opacity=(.2+Math.random()*.5).toFixed(2);document.body.appendChild(d);}
  const esc=(s)=>String(s==null?"":s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let st=null;
  // ticker: scroll at a steady speed; rebuild only when the text changes
  let tickHtml="",x=0,runW=0,last=performance.now();
  function setTicker(){
    const it=(st.liveNow||[]).map((c)=>'<span class="it">🔴 <b>'+esc(c.name)+'</b><span class="c">'+(c.stream!=null?c.stream.toLocaleString()+' secured this stream':'')+'</span><span class="m">'+c.total.toLocaleString()+' all-time · twitch.tv/'+esc(c.login)+'</span></span>');
    const parts=it.length?it:['<span class="it">No other streams are live with the game right now — <b>add Deviation Hunt to your channel</b> at <b>deviationhunt.ohwikiguide.com</b></span>'];
    parts.push('<span class="it">Play here any time: <b>!hourly</b> · <b>!daily</b> · <b>!secure</b> — <b>deviationhunt.ohwikiguide.com</b></span>');
    const once=parts.join('<span class="sep">◆</span>')+'<span class="sep">◆</span>';
    if(once===tickHtml)return; tickHtml=once;
    const run=document.getElementById("run"); run.innerHTML=once+once; runW=run.scrollWidth/2;
  }
  function frame(t){ const dt=Math.min(100,t-last); last=t; if(runW){ x-=dt*0.09; if(-x>=runW)x+=runW; document.getElementById("run").style.transform="translateX("+x.toFixed(1)+"px)"; } requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  function render(){
    setTicker();
    document.getElementById("rec").innerHTML=st.recent.map((r)=>'<div class="r"><img src="'+esc(r.img)+'" alt=""><div><div><span class="n">'+esc(r.name)+'</span>'+(r.variant?' <span class="v">✨ '+esc(r.variant)+'</span>':'')+'</div><div class="w">secured by '+esc(r.who)+(r.chan?' · '+esc(r.chan):'')+'</div></div><div class="rt">'+esc(r.rating)+'</div></div>').join("")||'<div class="w">Nothing secured yet — be the first!</div>';
    document.getElementById("metas").innerHTML=st.metas.map((m)=>'<li><b>'+esc(m.name)+'</b> <span>'+m.species+'/'+st.totalDevs+'</span></li>').join("");
    document.getElementById("streams").innerHTML=st.streams.map((s)=>'<li><b>'+esc(s.name)+'</b> <span>'+s.catches.toLocaleString()+'</span></li>').join("")||"<li>—</li>";
  }
  async function load(){
    try{const r=await fetch(location.pathname.replace(/\\/$/,"")+"/data",{cache:"no-store"});if(r.ok){const n=await r.json();if(st&&n.v&&st.v&&n.v!==st.v){location.reload();return;}st=n;render();}}catch(e){}
  }
  load();setInterval(load,10000);
})();
</script></body></html>`;
}

function mount(app, pool) {
  const find = (login) => db.getChannelByLogin(String(login || "").toLowerCase());
  app.get("/live/:login", (req, res) => {
    const ch = find(req.params.login);
    if (!ch || !ch.enabled) return res.status(404).send("That channel isn't running Deviation Hunt.");
    res.set("Cache-Control", "no-store").send(page(ch));
  });
  app.get("/live/:login/data", (req, res) => {
    const ch = find(req.params.login);
    if (!ch || !ch.enabled) return res.status(404).json({ error: "unknown_channel" });
    res.set("Cache-Control", "no-store").json(liveData(pool, ch));
  });
}

module.exports = { mount, liveData };
