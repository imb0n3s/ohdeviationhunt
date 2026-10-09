// live.js — a full-screen 1920×1080 page made to be streamed 24/7 (e.g. on the OHDeviationHunt channel) so
// people can play any time: /live/<channel login>. It embeds that channel's OBS Source (the deviation card +
// countdown), and around it shows how to play, the next-spawn timer, recent catches and the leaderboards.
// A headless browser + ffmpeg on a small server sends this page to Twitch (see docs/live-stream.md).
const cfg = require("./config");
const { GLOVES } = require("./rarity");
const isOwner = (name) => String(name).toLowerCase() === "imbon3s";
const db = require("./db");
const data = require("./data");
const overlay = require("./overlay");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const caughtSinceQ = db.raw.prepare(`SELECT COALESCE(SUM(caught),0) AS n FROM spawn_log WHERE broadcaster_id=? AND ts>=?`);
const recentQ = db.raw.prepare(`SELECT s.deviation, s.variant, s.power, s.mood, s.caught_at, p.display, c.display_name AS chan
  FROM specimens s JOIN players p ON p.user_id=s.user_id LEFT JOIN channels c ON c.broadcaster_id=s.channel
  ORDER BY s.caught_at DESC LIMIT ?`);

// Legendary catches (variations / skins / Chaos) on OTHER channels in the last few minutes -> BREAKING NEWS on the ticker (B 2026-10-08)
const BREAKING_MS = 3 * 60 * 1000;
const breakingQ = db.raw.prepare(`SELECT s.id, s.deviation, s.variant, s.power, s.mood, s.caught_at, p.display, c.display_name AS chan, c.login
  FROM specimens s JOIN players p ON p.user_id=s.user_id JOIN channels c ON c.broadcaster_id=s.channel
  WHERE s.variant<>'' AND s.channel<>? AND s.caught_at>=? ORDER BY s.caught_at DESC LIMIT 6`);

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
    buys: db.recentPurchases(now - BREAKING_MS).map((r) => ({ id: "b" + r.id, who: r.display, what: r.what, chan: r.chan, login: r.login })),
    breaking: breakingQ.all(bid, now - BREAKING_MS).map((r) => {
      const d = data.get(r.deviation);
      const v = d?.variants.find((x) => x.name === r.variant);
      return { id: r.id, who: r.display, name: d?.name || r.deviation, variant: `${v?.kind === "skin" ? "Skin" : "Variation"}: ${r.variant}`, rating: `${r.power}/${r.mood}`, chan: r.chan, login: r.login };
    }),
    // imbon3s (the game's owner) is left off both lists (B 2026-10-08)
    metas: db.leaderboard(6, "all").filter((r) => !isOwner(r.display)).slice(0, 5).map((r) => ({ name: r.display, species: r.species, total: r.total })),
    // most deviations collected in total (every catch, duplicates and scrapped ones too)
    most: db.mostCaught(6).filter((r) => !isOwner(r.display)).slice(0, 5).map((r) => ({ name: r.display, total: r.total })),
    streams: db.topStreams(5).map((c) => ({ name: c.display_name, catches: c.catches })),
    totalDevs: data.all().length,
    // the Shop takes a turn in the leaderboard box, with how much Starchrom has been spent in total (B 2026-10-08)
    shop: require("./shop").ITEMS.map((i) => ({ name: i.name, price: i.price, icon: "/panel/" + i.icon,
      note: i.kind === "gloves" ? `+${Math.round(i.bonus * 100)}% · ${GLOVES.find((g) => g.id === i.glove).catches} catches` : i.kind === "soup" ? `+${+(i.bonus * 100).toFixed(1)}% for 1 hour` : "holds 1 deviation" })),
    spent: db.starchromSpent(),
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
/* ranked lists in the rotating box (one at a time, full width): Top Metas (collected + caught) and Top Streams */
.rk h2{display:flex;justify-content:space-between;align-items:baseline}.rk h2 small{font-family:"Segoe UI",system-ui,sans-serif;font-size:17px;color:var(--muted);letter-spacing:0}
.rr{display:grid;grid-template-columns:34px 1fr auto auto;gap:14px;align-items:baseline;font-size:23px;line-height:1.6}
.rr.s{grid-template-columns:34px 1fr auto}.rr .n{color:var(--muted);font-weight:700}.rr b{color:var(--cyan);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rr .a{color:#fde68a;font-weight:700;text-align:right}.rr .c{color:var(--muted);font-size:19px;text-align:right;min-width:110px}
/* leaderboard box takes turns: Top Metas -> Most Caught -> Shop (all stacked in one cell so the card never changes size) */
.lbw{display:grid}.lbw>*{grid-area:1/1;transition:opacity .5s}.lbw>.off{opacity:0;visibility:hidden}
.shopv h2{display:flex;justify-content:space-between;align-items:baseline}.shopv h2 small{font-family:"Segoe UI",system-ui,sans-serif;font-size:18px;color:var(--muted);letter-spacing:0}
.spent{display:flex;align-items:center;gap:12px;margin:2px 0 12px;padding:8px 14px;border-radius:12px;background:rgba(242,192,52,.12);border:1px solid rgba(242,192,52,.45);font-size:21px;font-weight:700}
.spent b{color:var(--gold);font-size:30px;font-weight:900}
.sgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}
.si{display:flex;align-items:center;gap:10px;min-width:0}.si img{width:46px;height:46px;border-radius:9px;object-fit:cover;flex:none;background:#0b1519}
.si div{min-width:0;line-height:1.2}.si .nm{font-size:19px;font-weight:800;color:var(--cyan);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.si .pr{font-size:17px;color:#fde68a;font-weight:700}.si .nt{font-size:15px;color:var(--muted)}
.lbw.flash .shopv{animation:shopflash 1.4s ease-out}
@keyframes shopflash{0%,40%{filter:brightness(1.8) drop-shadow(0 0 18px rgba(242,192,52,.8))}100%{filter:none}}
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
/* BREAKING NEWS: a Legendary was secured on another stream */
#ticker.news{border-top-color:var(--gold);background:linear-gradient(90deg,#2a1d02,#3b2a05 50%,#2a1d02)}
#ticker.news .lab{background:var(--gold);color:#1a1200;animation:newsflash .7s steps(1) infinite}
#ticker.news .lab i{background:#1a1200}
#ticker .it.bn{color:#fff8e1}#ticker .it.bn b{color:var(--gold)}#ticker .it.bn .v{color:#fde68a}#ticker .it.bn .c{color:var(--cyan)}
@keyframes newsflash{0%{background:var(--gold);color:#1a1200}50%{background:#e11d48;color:#fff}}
#ticker.flash::after{content:"";position:absolute;inset:0;background:var(--gold);opacity:0;animation:tflash 1.6s ease-out}
@keyframes tflash{0%,30%,60%{opacity:.85}15%,45%,100%{opacity:0}}
</style></head><body>
<div id="bg"></div>
<header><img src="/panel/dh-logo.png" alt="">
  <div><div class="t stencil">Deviation Hunt</div><div class="s"><span class="badge">24/7</span>Catch Once Human deviations right here in chat</div></div></header>

<div id="stage">
  <!-- the countdown version of the OBS Source: countdown ring → deviation card → who caught it → countdown -->
  <iframe src="${esc(obs)}?countdown=1&lite=1" allowtransparency="true" scrolling="no"></iframe>
</div>

<div id="side">
  <div class="card"><h2 class="stencil">How to Play</h2><div class="how">
    <kbd>!secure</kbd><div>catch the deviation on screen</div>
    <kbd>!daily</kbd><div>free Starchrom + Securement Units</div>
    <kbd>!hourly</kbd><div>free unit + Starchrom every hour</div>
    <kbd>!pods</kbd><div>your collection</div>
    <kbd>!shop</kbd><div>units, Capture Soup &amp; gloves</div></div></div>
  <div class="card" style="flex:1;overflow:hidden"><h2 class="stencil">Recent Catches</h2><div class="rec" id="rec"></div></div>
  <div class="card"><div class="lbw" id="lbw">
    <div class="rk" id="metav"><h2 class="stencil">Collection Champions <small>⭐ = all ${data.all().length}</small></h2><div id="metas"></div></div>
    <div class="rk off" id="mostv"><h2 class="stencil">Most Collected <small>deviations caught in total</small></h2><div id="most"></div></div>
    <div class="rk off" id="streamv"><h2 class="stencil">Top Streams <small>deviations secured</small></h2><div id="streams"></div></div>
    <div class="shopv off" id="shopv"><h2 class="stencil">🛒 Shop <small>!shop · !buy &lt;item&gt; in chat</small></h2><div class="spent">🔥 <b id="spent">0</b> Starchrom spent so far</div><div class="sgrid" id="sgrid"></div></div></div></div>
</div>
<div id="ticker"><div class="lab"><i></i><span id="tlab">LIVE NOW</span></div><div class="win"><div class="run" id="run"></div></div></div>

<script>
(function(){
  // (floating dust removed — the stream box renders without a GPU, every moving thing costs frames)
  if(0)for(let i=0;i<26;i++){const d=document.createElement("div");d.className="dust";d.style.left=Math.random()*1920+"px";d.style.top=Math.random()*1080+"px";d.style.animationDelay=(-Math.random()*18)+"s";d.style.opacity=(.2+Math.random()*.5).toFixed(2);document.body.appendChild(d);}
  const esc=(s)=>String(s==null?"":s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let st=null;
  // ticker: scroll at a steady speed; rebuild only when the text changes
  let tickHtml="",x=0,runW=0,last=performance.now();
  let seenNews=null;
  function setTicker(){
    const news=(st.breaking||[]).concat(st.buys||[]), tk=document.getElementById("ticker");
    // BREAKING NEWS while someone on another stream has just secured a Legendary (B 2026-10-08)
    tk.classList.toggle("news",news.length>0); document.getElementById("tlab").textContent=news.length?"BREAKING NEWS":"LIVE NOW";
    const ids=news.map((n)=>n.id).join(",");
    if(seenNews!==null&&news.some((n)=>seenNews.indexOf(","+n.id+",")<0)){tk.classList.remove("flash");void tk.offsetWidth;tk.classList.add("flash");}
    seenNews=","+ids+",";
    if(news.length){
      const once=news.map((n)=>n.what
        // a Shop / Bits purchase (B 2026-10-09)
        ?'<span class="it bn">🛒 <b>@'+esc(n.who)+'</b> bought <span class="v">'+esc(n.what)+'</span>'+(n.chan?'on <b>'+esc(n.chan)+'</b><span class="m">twitch.tv/'+esc(n.login)+'</span>':'<span class="m">on the website</span>')+'</span>'
        :'<span class="it bn">🌟 <b>@'+esc(n.who)+'</b> secured a LEGENDARY <span class="v">✨ '+esc(n.name)+' ('+esc(n.variant)+')</span><span class="c">'+esc(n.rating)+'</span>on <b>'+esc(n.chan)+'</b><span class="m">twitch.tv/'+esc(n.login)+'</span></span>').join('<span class="sep">🌟</span>')+'<span class="sep">🌟</span>';
      return runTicker(once);
    }
    const it=(st.liveNow||[]).map((c)=>'<span class="it">🔴 <b>'+esc(c.name)+'</b><span class="c">'+c.total.toLocaleString()+' deviation'+(c.total===1?'':'s')+' caught</span><span class="m">twitch.tv/'+esc(c.login)+'</span></span>');
    // only the channels live with the game right now (B 2026-10-08)
    const parts=it.length?it:['<span class="it"><span class="m">No other channels are live with the game right now</span></span>'];
    runTicker(parts.join('<span class="sep">◆</span>')+'<span class="sep">◆</span>');
  }
  function runTicker(once){
    if(once===tickHtml)return; tickHtml=once; x=0;
    // repeat the line until it's at least as wide as the bar, so the scroll never shows a gap
    const run=document.getElementById("run"), win=run.parentNode.clientWidth; let unit=once; run.innerHTML=unit;
    for(let i=0;i<6&&run.scrollWidth<win;i++){unit+=once;run.innerHTML=unit;}
    run.innerHTML=unit+unit; runW=run.scrollWidth/2;
  }
  function frame(t){ const dt=Math.min(100,t-last); last=t; if(runW){ x-=dt*0.09; if(-x>=runW)x+=runW; document.getElementById("run").style.transform="translateX("+x.toFixed(1)+"px)"; } requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  // the box rotates every 7.5s: Collection Champions (58/61, ⭐ at 61) -> Most Collected (total caught) -> Top Streams -> Shop (B 2026-10-09)
  let metaMode=0;
  function renderMetas(){
    ["metav","mostv","streamv","shopv"].forEach((id,i)=>document.getElementById(id).classList.toggle("off",i!==metaMode));
    document.getElementById("spent").textContent=Number(st.spent||0).toLocaleString();
    const sg=(st.shop||[]).map((i)=>'<div class="si"><img src="'+esc(i.icon)+'" alt=""><div><div class="nm">'+esc(i.name)+'</div><div class="pr">'+Number(i.price).toLocaleString()+' Starchrom</div><div class="nt">'+esc(i.note)+'</div></div></div>').join(""), sgEl=document.getElementById("sgrid"); if(sgEl.dataset.h!==sg){sgEl.dataset.h=sg;sgEl.innerHTML=sg;}
    // Collection Champions: how many of the deviations they have (x/61); a ⭐ once they have them all (B 2026-10-09)
    document.getElementById("metas").innerHTML=st.metas.map((m,i)=>'<div class="rr s"><span class="n">'+(i+1)+'.</span><b>'+(m.species>=st.totalDevs?'⭐ ':'')+esc(m.name)+'</b><span class="a">'+m.species+'/'+st.totalDevs+'</span></div>').join("");
    document.getElementById("most").innerHTML=(st.most||[]).map((m,i)=>'<div class="rr s"><span class="n">'+(i+1)+'.</span><b>'+esc(m.name)+'</b><span class="a">'+Number(m.total).toLocaleString()+'</span></div>').join("")||'<div class="rr s"><span class="n"></span><b>—</b></div>';
    document.getElementById("streams").innerHTML=st.streams.map((s,i)=>'<div class="rr s"><span class="n">'+(i+1)+'.</span><b>'+esc(s.name)+'</b><span class="a">'+s.catches.toLocaleString()+'</span></div>').join("")||'<div class="rr"><span class="n"></span><b>—</b></div>';
  }
  setInterval(()=>{ if(!st)return; metaMode=(metaMode+1)%4; renderMetas(); if(metaMode===3){const w=document.getElementById("lbw");w.classList.remove("flash");void w.offsetWidth;w.classList.add("flash");} },7500);
  function render(){
    setTicker();
    document.getElementById("rec").innerHTML=st.recent.map((r)=>'<div class="r"><img src="'+esc(r.img)+'" alt=""><div><div><span class="n">'+esc(r.name)+'</span>'+(r.variant?' <span class="v">✨ '+esc(r.variant)+'</span>':'')+'</div><div class="w">secured by '+esc(r.who)+(r.chan?' · '+esc(r.chan):'')+'</div></div><div class="rt">'+esc(r.rating)+'</div></div>').join("")||'<div class="w">Nothing secured yet — be the first!</div>';
    renderMetas();
  }
  async function load(){
    try{const r=await fetch(location.pathname.replace(/\\/$/,"")+"/data",{cache:"no-store"});if(r.ok){const n=await r.json();if(st&&n.v&&st.v&&n.v!==st.v){location.reload();return;}st=n;render();}}catch(e){}
  }
  load();setInterval(load,10000);
})();
</script></body></html>`;
}

// ---- Shop OBS Source (B 2026-10-09): one link for every streamer, made for a break / BRB scene ----
// /obs-shop — transparent background, scales to fill the Browser source (800×450 recommended). Shows the Shop items,
// the total Starchrom spent and the latest purchase. ?bg=1 adds a dark background.
function shopData() {
  const last = db.recentPurchases(Date.now() - 6 * 3600e3, 1)[0];
  return {
    shop: require("./shop").ITEMS.map((i) => ({ name: i.name, price: i.price, icon: "/panel/" + i.icon,
      cmd: i.kind === "gloves" ? `!buy ${i.glove}` : i.kind === "soup" ? "!buy soup" : "!buy 3",
      note: i.kind === "gloves" ? `+${Math.round(i.bonus * 100)}% · ${GLOVES.find((g) => g.id === i.glove).catches} catches` : i.kind === "soup" ? `+${+(i.bonus * 100).toFixed(1)}% for 1 hour` : "holds 1 deviation" })),
    spent: db.starchromSpent(),
    last: last ? { who: last.display, what: last.what, chan: last.chan } : null,
    v: overlay.BOOT,
  };
}
function shopPage(bg) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Deviation Hunt — Shop</title>
<link href="https://fonts.googleapis.com/css2?family=Black+Ops+One&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${bg ? "#05080a" : "transparent"};font-family:"Segoe UI",system-ui,"Noto Sans",sans-serif;color:#e6edf5}
#wrap{position:absolute;left:50%;top:50%;width:800px;transform:translate(-50%,-50%) scale(var(--s,1));transform-origin:center}
.card{background:rgba(11,21,25,.9);border:2px solid rgba(34,211,238,.35);border-radius:22px;padding:20px 24px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
.hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
.stencil{font-family:"Black Ops One",Impact,sans-serif;font-size:38px;background:linear-gradient(#fff1b8,#f2c034 45%,#9a5b07);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 #0b1416)}
.hint{font-size:20px;color:#94a3b8}.hint b{color:#22d3ee}
.spent{display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:10px 16px;border-radius:14px;background:rgba(242,192,52,.12);border:1px solid rgba(242,192,52,.45);font-size:23px;font-weight:700}
.spent b{color:#f2c034;font-size:34px;font-weight:900}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px}
.it{display:flex;align-items:center;gap:12px;min-width:0}.it img{width:58px;height:58px;border-radius:10px;object-fit:cover;flex:none;background:#0b1519}
.it .nm{font-size:22px;font-weight:800;color:#22d3ee}.it .pr{font-size:19px;color:#fde68a;font-weight:700}.it .nt{font-size:16px;color:#94a3b8;white-space:nowrap}.it .nt b{color:#e6edf5}
.last{margin-top:14px;padding-top:12px;border-top:1px solid rgba(34,211,238,.2);font-size:19px;color:#cbd5e1;min-height:24px}.last b{color:#f2c034}
</style></head><body><div id="wrap"><div class="card">
<div class="hd"><div class="stencil">🛒 Deviation Hunt Shop</div><div class="hint">type <b>!buy</b> in chat</div></div>
<div class="spent">🔥 <b id="spent">0</b> Starchrom spent so far</div>
<div class="grid" id="grid"></div>
<div class="last" id="last"></div>
</div></div>
<script>
(function(){
  const esc=(s)=>String(s==null?"":s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const wrap=document.getElementById("wrap"); let v=null, gridH="";
  function fit(){ const w=wrap.offsetWidth, h=wrap.offsetHeight; if(w&&h) wrap.style.setProperty("--s", Math.min(innerWidth*.98/w, innerHeight*.98/h)); }
  addEventListener("resize", fit);
  async function load(){
    try{ const r=await fetch("/obs-shop/data",{cache:"no-store"}); if(!r.ok) return; const d=await r.json();
      if(v&&d.v&&d.v!==v){ location.reload(); return; } v=d.v;
      document.getElementById("spent").textContent=Number(d.spent||0).toLocaleString();
      const g=d.shop.map((i)=>'<div class="it"><img src="'+esc(i.icon)+'" alt=""><div><div class="nm">'+esc(i.name)+'</div><div class="pr">'+Number(i.price).toLocaleString()+' Starchrom</div><div class="nt"><b>'+esc(i.cmd)+'</b> · '+esc(i.note)+'</div></div></div>').join("");
      if(g!==gridH){ gridH=g; document.getElementById("grid").innerHTML=g; }
      document.getElementById("last").innerHTML=d.last?'🛒 Latest: <b>@'+esc(d.last.who)+'</b> bought '+esc(d.last.what)+(d.last.chan?' on '+esc(d.last.chan):''):'Units, Capture Soup &amp; Gloves — your Starchrom works on every stream.';
      fit();
    }catch(e){}
  }
  load(); setInterval(load, 15000); setTimeout(fit, 300);
})();
</script></body></html>`;
}

function mount(app, pool) {
  app.get("/obs-shop", (req, res) => res.set("Cache-Control", "no-store").send(shopPage(req.query.bg === "1")));
  app.get("/obs-shop/data", (req, res) => res.set("Cache-Control", "no-store").json(shopData()));
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
