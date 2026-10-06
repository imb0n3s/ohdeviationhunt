// live.js — a full-screen 1920×1080 page made to be streamed 24/7 (e.g. on the OHDeviationHunt channel) so
// people can play any time: /live/<channel login>. It embeds that channel's OBS Source (the deviation card +
// countdown), and around it shows how to play, the next-spawn timer, recent catches and the leaderboards.
// A headless browser + ffmpeg on a small server sends this page to Twitch (see docs/live-stream.md).
const cfg = require("./config");
const db = require("./db");
const data = require("./data");
const overlay = require("./overlay");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  const idleChat = now - (sp?.lastChat?.get(bid) || 0) > cfg.ACTIVITY_WINDOW_MIN * 60 * 1000;
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
#stage{position:absolute;left:48px;top:178px;width:1150px;height:800px;border-radius:24px;border:2px solid var(--line);background:radial-gradient(circle at 50% 45%,rgba(34,211,238,.12),rgba(5,8,10,.6) 70%);overflow:hidden}
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
#side{position:absolute;left:1230px;top:36px;width:642px;height:942px;display:flex;flex-direction:column;gap:18px}
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
#ticker{position:absolute;left:1230px;bottom:30px;width:642px;text-align:center;font-size:30px;color:#cbd5e1;font-weight:700}
#ticker b{color:var(--cyan)}
</style></head><body>
<div id="bg"></div>
<header><img src="/panel/dh-logo.png" alt="">
  <div><div class="t stencil">Deviation Hunt</div><div class="s"><span class="badge">24/7</span>Catch Once Human deviations right here in chat</div></div></header>

<div id="stage">
  <div id="idle"><div class="ring"><div><div class="lbl">Next deviation</div><div class="big stencil" id="eta">—</div></div></div>
    <div class="msg" id="idlemsg">Type <b>!daily</b> for free Starchrom, then <b>!secure</b> when one shows up</div></div>
  <iframe src="${esc(obs)}" allowtransparency="true" scrolling="no"></iframe>
</div>

<div id="side">
  <div class="card"><h2 class="stencil">How to Play</h2><div class="how">
    <kbd>!secure</kbd><div>catch the deviation on screen</div>
    <kbd>!daily</kbd><div>free Starchrom + Securement Units</div>
    <kbd>!pods</kbd><div>your collection</div>
    <kbd>!shop</kbd><div>units, Capture Soup &amp; gloves</div></div></div>
  <div class="card" style="flex:1;overflow:hidden"><h2 class="stencil">Recent Catches</h2><div class="rec" id="rec"></div></div>
  <div class="card"><div class="lb">
    <div><h2 class="stencil">Top Metas</h2><ol id="metas"></ol></div>
    <div><h2 class="stencil">Top Streams</h2><ol id="streams"></ol></div></div></div>
</div>
<div id="ticker"><b>deviationhunt.ohwikiguide.com</b></div>

<script>
(function(){
  for(let i=0;i<26;i++){const d=document.createElement("div");d.className="dust";d.style.left=Math.random()*1920+"px";d.style.top=Math.random()*1080+"px";d.style.animationDelay=(-Math.random()*18)+"s";d.style.opacity=(.2+Math.random()*.5).toFixed(2);document.body.appendChild(d);}
  const esc=(s)=>String(s==null?"":s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let st=null,skew=0;
  function tick(){
    if(!st)return;
    const idle=document.getElementById("idle");
    idle.classList.toggle("hide",st.active);
    const eta=document.getElementById("eta"),msg=document.getElementById("idlemsg");
    if(!st.spawnsOn){eta.textContent="Paused";msg.innerHTML="Spawns are paused right now — check back soon";return;}
    if(st.idleChat){eta.textContent="Zzz";msg.innerHTML="The deviations are asleep — <b>say hi in chat</b> to wake them up!";return;}
    const left=st.nextAt?Math.max(0,st.nextAt-(Date.now()+skew)):null;
    if(left==null){eta.textContent="Soon";}
    else{const s=Math.ceil(left/1000);eta.textContent=s<=0?"Any second":Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
    msg.innerHTML="Type <b>!daily</b> for free Starchrom, then <b>!secure</b> when one shows up";
  }
  function render(){
    document.getElementById("rec").innerHTML=st.recent.map((r)=>'<div class="r"><img src="'+esc(r.img)+'" alt=""><div><div><span class="n">'+esc(r.name)+'</span>'+(r.variant?' <span class="v">✨ '+esc(r.variant)+'</span>':'')+'</div><div class="w">secured by '+esc(r.who)+(r.chan?' · '+esc(r.chan):'')+'</div></div><div class="rt">'+esc(r.rating)+'</div></div>').join("")||'<div class="w">Nothing secured yet — be the first!</div>';
    document.getElementById("metas").innerHTML=st.metas.map((m)=>'<li><b>'+esc(m.name)+'</b> <span>'+m.species+'/'+st.totalDevs+'</span></li>').join("");
    document.getElementById("streams").innerHTML=st.streams.map((s)=>'<li><b>'+esc(s.name)+'</b> <span>'+s.catches.toLocaleString()+'</span></li>').join("")||"<li>—</li>";
  }
  async function load(){
    try{const r=await fetch(location.pathname.replace(/\\/$/,"")+"/data",{cache:"no-store"});if(r.ok){st=await r.json();skew=st.now-Date.now();render();tick();}}catch(e){}
  }
  load();setInterval(load,10000);setInterval(tick,1000);
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
