// overlay.js — "OBS Source": a transparent Browser Source that shows the deviation loose in a
// channel right now, with a countdown until it can't be caught any more.
//
//   https://<site>/obs-source/<code>          the page for OBS (checks every 1.5 s)
//   https://<site>/obs-source/<code>?demo=1   always shows a sample, for positioning in OBS
//   https://<site>/obs-source/<code>/state    JSON the page polls
//
// <code> is a random per-channel code (so the link doesn't carry the channel name, and other
// people can't casually put your overlay on their stream). Mods get it with !hunt obs.
const crypto = require("crypto");
const cfg = require("./config");
const db = require("./db");
const data = require("./data");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// one stable code per channel, created on first use
function codeFor(bid) {
  const key = `obs:${bid}`;
  let code = db.q.getSetting.get(key)?.value;
  if (!code) {
    code = crypto.randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8).padEnd(8, "x");
    db.q.setSetting.run(key, code);
    db.q.setSetting.run(`obs-code:${code}`, bid);
  }
  return code;
}
const channelForCode = (code) => db.q.getSetting.get(`obs-code:${String(code).toLowerCase()}`)?.value || null;
const linkFor = (bid) => `${cfg.BASE_URL}/obs-source/${codeFor(bid)}`;

const RESULT_MS = 12000;
// changes on every server start: an OBS source still running an older page reloads itself
const BOOT = Date.now().toString(36); // how long the "who caught it" card stays up

function stateFor(pool, code) {
  const bid = channelForCode(code);
  const ch = bid && db.getChannel(bid);
  if (!ch) return { ok: false, error: "unknown_channel", v: BOOT };
  pool?.spawns?.overlaySeen?.set(bid, Date.now()); // this channel has the OBS Source on stream
  const s = pool?.spawns?.active.get(bid);
  if (!s || !(s.endsAt > Date.now())) {
    // just resolved? show who caught it for a few seconds (stays up past the delayed chat message)
    const r = pool?.spawns?.lastResult?.get(bid);
    const showMs = Math.max(RESULT_MS, (pool?.spawns?.chatDelayMs?.(bid) || 0) + 8000);
    return r && r.winners.length && Date.now() - r.at < showMs ? { ok: true, active: false, result: r, now: Date.now(), v: BOOT } : { ok: true, active: false, v: BOOT };
  }
  return {
    ok: true, active: true, v: BOOT,
    id: `${s.dev.id}:${s.endsAt}`,             // changes for every new spawn
    name: s.dev.name,
    variant: s.variant ? { name: s.variant.name, kind: s.variant.kind } : null,
    img: (s.variant && s.variant.img) || s.dev.img,
    endsAt: s.endsAt, now: Date.now(), windowMs: cfg.SPAWN_WINDOW_SECONDS * 1000,
  };
}

// demo: true (OBS positioning sample) or "base" | "variation" | "skin" (homepage preview)
function page(code, demo) {
  const all = data.all();
  const sample = !demo ? null
    : demo === "base" ? all.find((d) => d.id === "lonewolfwhisper") || all[0]
    : all.find((d) => d.id === "grumpybulb") || all[0];
  const v = !sample ? null
    : demo === "base" ? null
    : demo === "skin" ? sample.variants.find((x) => x.kind === "skin") || null
    : sample.variants.find((x) => x.kind === "variation") || sample.variants[0] || null;
  // results-card demos: "result" (Rare catch), "resultlegend" (Chaos), "resultmiss" (got away)
  if (demo === "result" || demo === "resultlegend" || demo === "resultmiss") {
    const d = all.find((x) => x.id === "snowsprite") || all[0];
    const chaos = demo === "resultlegend" ? d.variants.find((x) => /chaos/i.test(x.name)) : null;
    const tier = chaos ? "legendary" : d.rarity;
    const T = require("./rarity").TIERS;
    const r = { id: "demo-result", name: d.name, img: (chaos && chaos.img) || d.img, tier, tierLabel: T[tier].label,
      variant: chaos ? "🌀 Chaos Variation" : null, stars: { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[tier],
      winners: demo === "resultmiss" ? [] : [{ name: "imbon3s", rating: "4/2" }, { name: "luna_raventhorn", rating: "5/5 ⭐" }],
      escaped: ["DeeOhGee024"], reward: T[tier].reward, tried: 3, demo: true };
    return pageHtml(code, "null", JSON.stringify(r));
  }
  const demoState = sample ? JSON.stringify({ ok: true, active: true, id: "demo", name: sample.name, variant: v ? { name: v.name, kind: v.kind } : null, img: (v && v.img) || sample.img, demo: true, windowMs: cfg.SPAWN_WINDOW_SECONDS * 1000 }) : "null";
  return pageHtml(code, demoState, "null");
}

function pageHtml(code, demoState, demoResult) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Deviation Hunt — OBS Source</title>
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;font-family:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
#card{position:absolute;left:50%;top:50%;width:420px;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.2,1.4,.4,1);text-align:center;color:#fff}
#card.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
.tag{display:inline-block;background:#0ea5e9;color:#04121c;font-weight:900;letter-spacing:2px;font-size:15px;padding:5px 14px;border-radius:999px;text-transform:uppercase;box-shadow:0 4px 18px rgba(0,0,0,.45)}
.glow{position:relative;width:300px;height:300px;margin:10px auto 0}
.glow:before{content:"";position:absolute;inset:30px;border-radius:50%;background:radial-gradient(circle,rgba(14,165,233,.55),rgba(14,165,233,0) 70%);filter:blur(6px);animation:pulse 1.6s ease-in-out infinite}
#card.variation .glow:before{background:radial-gradient(circle,rgba(251,191,36,.6),rgba(251,191,36,0) 70%)}
#card.skin .glow:before{background:radial-gradient(circle,rgba(232,121,249,.6),rgba(232,121,249,0) 70%)}
.glow img{position:relative;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 8px 18px rgba(0,0,0,.6));animation:bob 2.4s ease-in-out infinite}
@keyframes pulse{50%{transform:scale(1.12);opacity:.75}}
@keyframes bob{50%{transform:translateY(-8px)}}
.name{font-size:34px;font-weight:900;margin-top:4px;text-shadow:0 3px 10px rgba(0,0,0,.85),0 0 2px #000}
.variant{font-size:19px;font-weight:800;margin-top:2px;text-shadow:0 2px 8px rgba(0,0,0,.9)}
#card.variation .variant{color:#fde68a}#card.skin .variant{color:#f5d0fe}
.cta{display:inline-block;margin-top:10px;background:rgba(13,19,25,.85);border:2px solid #0ea5e9;border-radius:12px;padding:6px 16px;font-size:20px;font-weight:800}
.cta b{color:#7dd3fc}
.count{font-size:44px;font-weight:900;margin-top:6px;letter-spacing:1px;font-variant-numeric:tabular-nums;text-shadow:0 3px 10px rgba(0,0,0,.9),0 0 2px #000}
.count small{display:block;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#cbd5e1;margin-top:-4px}
.count.low{color:#f87171;animation:blink .5s steps(2) infinite}
@keyframes blink{50%{opacity:.55}}
.bar{width:300px;height:8px;margin:12px auto 0;background:rgba(13,19,25,.8);border-radius:99px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.5)}
.bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#0ea5e9,#7dd3fc);transform-origin:left}
#card.variation .bar i{background:linear-gradient(90deg,#f59e0b,#fde68a)}#card.skin .bar i{background:linear-gradient(90deg,#d946ef,#f5d0fe)}
#res{position:absolute;left:50%;top:50%;width:580px;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.2,1.4,.4,1);text-align:center;color:#fff}
#res.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
#res .rt{display:inline-block;font-weight:900;letter-spacing:3px;font-size:30px;padding:8px 24px;border-radius:999px;color:#04121c;background:#22c55e;box-shadow:0 4px 18px rgba(0,0,0,.6)}
#res .rt{white-space:nowrap}#res.legend .rt{font-size:26px;letter-spacing:2px;background:linear-gradient(90deg,#fbbf24,#fde68a,#fbbf24)}
#res .glow{width:170px;height:170px;margin:6px auto 0}#res .glow:before{background:radial-gradient(circle,rgba(34,197,94,.55),rgba(34,197,94,0) 70%)}
#res.legend .glow:before{background:radial-gradient(circle,rgba(251,191,36,.7),rgba(251,191,36,0) 70%)}
#res .rn{font-size:40px;font-weight:900;line-height:1.1;text-shadow:0 3px 10px #000,0 0 3px #000}#res .rr{font-size:24px;font-weight:800;color:#38bdf8;text-shadow:0 2px 6px #000,0 0 2px #000}#res.legend .rr{color:#fbbf24}
#res .list{margin:10px auto 0;display:flex;flex-direction:column;gap:8px;width:580px}
#res .row{display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(8,14,20,.9);border:2px solid rgba(34,197,94,.7);border-radius:14px;padding:8px 16px;font-weight:900;font-size:36px;line-height:1.15;text-shadow:0 2px 4px #000}
#res .row b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
#res.legend .row{border-color:rgba(251,191,36,.8)}#res .row span{font-size:30px;color:#fde68a;white-space:nowrap}
#res.many .row{font-size:28px;padding:5px 14px}#res.many .row span{font-size:24px}#res.many .glow{width:120px;height:120px}
#res .more,#res .missed{margin-top:8px;font-size:22px;font-weight:700;color:rgba(255,255,255,.85);text-shadow:0 2px 6px #000,0 0 2px #000}
</style></head><body>
<div id="card"><div class="tag">Spotted in the wild</div>
<div class="glow"><img id="img" alt=""></div>
<div class="name" id="name"></div><div class="variant" id="variant"></div>
<div class="cta">Type <b>!secure</b> to catch it</div>
<div class="bar"><i id="bar"></i></div>
<div class="count" id="count">0:00<small>left to catch</small></div></div>
<div id="res"><div class="rt" id="rt"></div><div class="glow"><img id="rimg" alt=""></div><div class="rn" id="rn"></div><div class="rr" id="rr"></div><div class="list" id="rlist"></div><div class="missed" id="rmiss"></div></div>
<script>
(function(){
  var code=${JSON.stringify(code)}, demo=${demoState}, demoResult=${demoResult}, res=document.getElementById("res"), shownResult=null, card=document.getElementById("card"), bar=document.getElementById("bar"), count=document.getElementById("count");
  function setCount(sec){ sec=Math.max(0,Math.ceil(sec)); count.firstChild.nodeValue=Math.floor(sec/60)+":"+("0"+(sec%60)).slice(-2); count.className="count"+(sec<=10?" low":""); }
  var current=null, skew=0, hideTimer=null;
  function show(s){
    if(current&&current.id===s.id){current=s;return;}
    current=s;
    document.getElementById("img").src=s.img;
    document.getElementById("name").textContent=s.name;
    document.getElementById("variant").textContent=s.variant?("\\u2728 "+(s.variant.kind==="skin"?"Skin":"Variation")+": "+s.variant.name):"";
    card.className=(s.variant?s.variant.kind:"")+" show";
  }
  function hide(){current=null;card.className=(card.className||"").replace("show","").trim();}
  function txt(id,t){document.getElementById(id).textContent=t;}
  // "who caught it" card, shown for a few seconds after the deviation is gone
  function showResult(r){
    if(shownResult===r.id)return; shownResult=r.id; hide();
    var won=r.winners&&r.winners.length, legend=r.tier==="legendary";
    var star=legend?"\ud83c\udf1f":"\u2b50", stars=new Array(r.stars+1).join(star);
    txt("rt", won?(legend?star+" LEGENDARY SECURED! "+star:stars+" SECURED! "+stars):(r.tried?"\ud83d\udca5 GOT AWAY!":"\ud83d\udca8 SLIPPED AWAY"));
    document.getElementById("rimg").src=r.img; txt("rn",r.name); txt("rr",(r.variant?r.variant+" \u00b7 ":"")+r.tierLabel+" \u00b7 +"+r.reward);
    var list=document.getElementById("rlist"); list.innerHTML="";
    (r.winners||[]).slice(0,4).forEach(function(w){var d=document.createElement("div");d.className="row";var nb=document.createElement("b");nb.textContent="@"+w.name;d.appendChild(nb);var sp=document.createElement("span");sp.textContent=w.rating;d.appendChild(sp);list.appendChild(d);});
    if((r.winners||[]).length>4){var m=document.createElement("div");m.className="more";m.textContent="+"+(r.winners.length-4)+" more";list.appendChild(m);}
    var esc=r.escaped||[]; txt("rmiss", esc.length?("\ud83d\udca5 "+(won?"Broke free from ":"Got away from ")+esc.slice(0,4).join(", ")+(esc.length>4?" +"+(esc.length-4)+" more":"")):(r.tried?"":"Nobody tried to secure it"));
    res.className=(won?(legend?"legend":""):"miss")+((r.winners||[]).length>=3?" many":"")+" show";
  }
  function hideResult(){ if(res.className.indexOf("show")>=0) res.className=res.className.replace("show","").trim(); }
  function tick(){
    if(!current)return;
    if(current.demo){var d=${cfg.SPAWN_WINDOW_SECONDS}-((Date.now()/1000)%${cfg.SPAWN_WINDOW_SECONDS});bar.style.transform="scaleX("+(d/${cfg.SPAWN_WINDOW_SECONDS})+")";setCount(d);return;}
    var left=current.endsAt-(Date.now()+skew), f=Math.max(0,Math.min(1,left/current.windowMs));
    bar.style.transform="scaleX("+f+")"; setCount(left/1000);
    if(left<=0)hide();
  }
  function poll(){
    fetch("/obs-source/"+encodeURIComponent(code)+"/state",{cache:"no-store"}).then(function(r){return r.json();}).then(function(s){
      if(s.v&&s.v!==${JSON.stringify(BOOT)}&&!current){location.reload();return;} // server updated: load the new page
      if(s.active){skew=s.now-Date.now();hideResult();show(s);}
      else { if(current)hide(); if(s.result)showResult(s.result); else hideResult(); }
    }).catch(function(){}).then(function(){setTimeout(poll,1500);});
  }
  setInterval(tick,100);
  if(demoResult)showResult(demoResult);else if(demo)show(demo);else poll();
})();
</script></body></html>`;
}

function mount(app, pool) {
  app.get("/obs-source/:code/state", (req, res) => {
    res.set("Cache-Control", "no-store");
    const st = stateFor(pool, req.params.code);
    res.status(st.ok ? 200 : 404).json(st);
  });
  // public preview for the homepage: /obs-preview?kind=base|variation|skin
  app.get("/obs-preview", (req, res) => {
    const kind = ["base", "variation", "skin", "result", "resultlegend", "resultmiss"].includes(req.query.kind) ? req.query.kind : "base";
    res.set("Cache-Control", "public, max-age=300");
    res.send(page("preview", kind));
  });
  app.get("/obs-source/:code", (req, res) => {
    const code = String(req.params.code).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!channelForCode(code)) return res.status(404).send("Unknown OBS Source link. A mod can get the right one by typing !hunt obs in chat.");
    res.set("Cache-Control", "no-store");
    res.send(page(code, req.query.demo === "result" ? "result" : req.query.demo === "1"));
  });
}

module.exports = { mount, stateFor, linkFor, codeFor };
