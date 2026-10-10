// overlay.js — "OBS Source": a transparent Browser Source that shows the deviation loose in a
// channel right now, with a countdown until it can't be caught any more.
//
//   https://<site>/obs-source/<code>          the page for OBS (checks every 1.5 s)
//   https://<site>/obs-source/<code>?demo=1   always shows a sample, for positioning in OBS (plays the alert once)
//   ?countdown=1 = between spawns show a ring counting down to the next one (default: hidden until one appears)
//   ?sound=0 = no spawn alert · ?volume=0-100 (default 100) · ?demo=base / ?demo=variation = normal / Legendary alert sample
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

function stateFor(pool, code, opts = {}) {
  const bid = channelForCode(code);
  const ch = bid && db.getChannel(bid);
  if (!ch) return { ok: false, error: "unknown_channel", v: BOOT };
  // this channel has the OBS Source on stream (the progress bar alone doesn't count: it doesn't show the deviation)
  if (!opts.bar) pool?.spawns?.overlaySeen?.set(bid, Date.now());
  const s = pool?.spawns?.active.get(bid);
  if (!s || !((s.shownEndsAt || s.endsAt) > Date.now())) {
    // for the countdown version (?countdown=1): when the next one is due, or why it's waiting
    const sp = pool?.spawns;
    const next = { at: sp?.nextAt?.get(bid) || null, from: sp?.nextFrom?.get(bid) || null, live: !!sp?.live?.has(bid), spawnsOn: !!ch.spawns_on,
      idleChat: !sp?.alwaysOn?.(bid) && Date.now() - (sp?.lastChat?.get(bid) || 0) > cfg.ACTIVITY_WINDOW_MIN * 60 * 1000 };
    // just resolved? show who caught it for a few seconds (stays up past the delayed chat message)
    const r = sp?.lastResult?.get(bid);
    const showMs = Math.max(RESULT_MS, (sp?.chatDelayMs?.(bid) || 0) + 8000);
    return r && r.winners.length && Date.now() - r.at < showMs ? { ok: true, active: false, result: r, next, now: Date.now(), v: BOOT } : { ok: true, active: false, next, now: Date.now(), v: BOOT };
  }
  return {
    ok: true, active: true, v: BOOT,
    id: `${s.dev.id}:${s.endsAt}`,             // changes for every new spawn
    name: s.dev.name,
    // the OBS Source shows a variation/skin as it spawns, unless the streamer turned on "!hunt surprise"
    // (then it looks like the normal deviation until the result). Chat never says it before the result.
    ...(s.variant && db.getSetting(`surprise:${bid}`) !== "on"
      ? { variant: { name: s.variant.name, kind: s.variant.kind }, img: s.variant.img || s.dev.img }
      : { variant: null, img: s.dev.img }),
    endsAt: s.shownEndsAt || s.endsAt, now: Date.now(), windowMs: cfg.SPAWN_WINDOW_SECONDS * 1000,
    pool: pool?.spawns?.poolState?.(bid) || null,   // Legendary pool bar (only for a shown Legendary)
  };
}

// demo: true (OBS positioning sample) or "base" | "variation" | "skin" (homepage preview)
function page(code, demo) {
  if (demo === "countdown") return pageHtml(code, JSON.stringify("countdown"), "null");
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
      variant: chaos ? "🌀 Chaos Variation" : null, stars: chaos ? 5 : 1, legend: !!chaos,
      winners: demo === "resultmiss" ? [] : [{ name: "imbon3s", rating: "4/2" }, { name: "luna_raventhorn", rating: "5/5 ⭐" }],
      escaped: ["DeeOhGee024"], reward: T[tier].reward, tried: 3, demo: true };
    return pageHtml(code, "null", JSON.stringify(r));
  }
  const demoState = sample ? JSON.stringify({ ok: true, active: true, id: "demo", name: sample.name, variant: v ? { name: v.name, kind: v.kind } : null, img: (v && v.img) || sample.img, demo: true, windowMs: cfg.SPAWN_WINDOW_SECONDS * 1000,
    pool: v ? { total: 6250, goal: require("./rarity").ECONOMY.legendaryPoolGoal, donors: 9, full: false } : null }) : "null";
  return pageHtml(code, demoState, "null");
}

function pageHtml(code, demoState, demoResult) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Deviation Hunt — OBS Source</title>
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;font-family:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
#card{--s:1;position:absolute;left:50%;top:50%;width:420px;transform:translate(-50%,-50%) scale(calc(var(--s)*.6));opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.2,1.4,.4,1);text-align:center;color:#fff}
#card.show{opacity:1;transform:translate(-50%,-50%) scale(var(--s))}
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
#res{--s:1;position:absolute;left:50%;top:50%;width:580px;transform:translate(-50%,-50%) scale(calc(var(--s)*.6));opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.2,1.4,.4,1);text-align:center;color:#fff}
#res.show{opacity:1;transform:translate(-50%,-50%) scale(var(--s))}
#res .rt{display:inline-block;font-weight:900;letter-spacing:3px;font-size:30px;padding:8px 24px;border-radius:999px;color:#04121c;background:#22c55e;box-shadow:0 4px 18px rgba(0,0,0,.6)}
#res .rt{white-space:nowrap}#res.legend .rt{font-size:26px;letter-spacing:2px;background:linear-gradient(90deg,#fbbf24,#fde68a,#fbbf24)}
#res .glow{width:220px;height:220px;margin:6px auto 0}#res .glow:before{background:radial-gradient(circle,rgba(34,197,94,.55),rgba(34,197,94,0) 70%)}
#res.legend .glow:before{background:radial-gradient(circle,rgba(251,191,36,.7),rgba(251,191,36,0) 70%)}
#res .rn{font-size:40px;font-weight:900;line-height:1.1;text-shadow:0 3px 10px #000,0 0 3px #000}#res .rr{font-size:24px;font-weight:800;color:#38bdf8;text-shadow:0 2px 6px #000,0 0 2px #000}#res.legend .rr{color:#fbbf24}
#res .list{margin:10px auto 0;display:flex;flex-direction:column;gap:8px;width:580px}
#res .row{display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(8,14,20,.9);border:2px solid rgba(34,197,94,.7);border-radius:14px;padding:8px 16px;font-weight:900;font-size:36px;line-height:1.15;text-shadow:0 2px 4px #000}
#res .row .who{display:flex;flex-direction:column;align-items:flex-start;min-width:0;text-align:left}#res .row b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:100%}#res .row i{font-style:normal;font-size:22px;color:#fde68a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}#res .row.lg{border-color:rgba(251,191,36,.9)}
#res.legend .row{border-color:rgba(251,191,36,.8)}#res .row span{font-size:30px;color:#fde68a;white-space:nowrap}
#res.many .row{font-size:28px;padding:5px 14px}#res.many .row span{font-size:24px}#res.many .glow{width:120px;height:120px}
#res .more,#res .missed{margin-top:8px;font-size:22px;font-weight:700;color:rgba(255,255,255,.85);text-shadow:0 2px 6px #000,0 0 2px #000}
.dcta{display:none;margin-top:6px;border-color:#f59e0b;font-size:18px;padding:4px 14px}.dcta b{color:#fde68a}.dcta.on{display:table;margin:6px auto 0}
#pool{display:none;width:340px;margin:12px auto 0}#pool.on{display:block}
#pool .pb{height:16px;background:rgba(13,19,25,.85);border:2px solid rgba(251,191,36,.8);border-radius:99px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.5)}
#pool .pb i{display:block;height:100%;width:0;background:linear-gradient(90deg,#f59e0b,#fde68a);transition:width .6s ease}
#pool .pt{margin-top:5px;font-size:17px;white-space:nowrap;font-weight:900;color:#fde68a;text-shadow:0 2px 6px #000,0 0 2px #000}
#pool.full .pb{border-color:#22c55e}#pool.full .pb i{background:linear-gradient(90deg,#22c55e,#86efac)}#pool.full .pt{color:#86efac}
#cd{--s:1;position:absolute;left:50%;top:50%;width:420px;transform:translate(-50%,-50%) scale(calc(var(--s)*.85));opacity:0;transition:opacity .5s ease,transform .5s ease;text-align:center;color:#fff}
#cd.show{opacity:1;transform:translate(-50%,-50%) scale(var(--s))}
#cd .ring{width:330px;height:330px;margin:0 auto;border-radius:50%;border:11px dashed rgba(34,211,238,.6);display:flex;align-items:center;justify-content:center;animation:spin 30s linear infinite;background:radial-gradient(circle,rgba(8,14,20,.82) 58%,rgba(8,14,20,.55));box-shadow:0 0 40px rgba(34,211,238,.28) inset,0 0 34px rgba(34,211,238,.22)}
#cd .ring>div{animation:spin 30s linear infinite reverse}
@keyframes spin{to{transform:rotate(360deg)}}
#cd .lbl{font-size:19px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#cbd5e1;text-shadow:0 2px 6px #000}
#cd .big{font-family:"Black Ops One",Impact,sans-serif;font-size:80px;line-height:1.05;margin-top:4px;background:linear-gradient(#fff1b8,#f2c034 45%,#9a5b07);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 #0b1416) drop-shadow(0 5px 8px rgba(0,0,0,.7));font-variant-numeric:tabular-nums}
#cd .big.word{font-size:58px}
#cd .cdm{display:inline-block;margin-top:14px;background:rgba(13,19,25,.85);border:2px solid #22d3ee;border-radius:12px;padding:6px 16px;font-size:21px;font-weight:800;text-shadow:0 2px 4px #000}
#cd .cdm b{color:#7dd3fc}
</style>
<link href="https://fonts.googleapis.com/css2?family=Black+Ops+One&display=swap" rel="stylesheet">
<script>if(/[?&]lite=1/.test(location.search))document.documentElement.className="lite";</script>
<style>/* ?lite=1 (the 24/7 stream box has no GPU): no continuous blur/shadow/spin animations */
.lite .glow:before,.lite .glow img,.lite #cd .ring,.lite #cd .ring>div{animation:none!important}.lite .glow:before{filter:none}</style></head><body>
<div id="cd"><div class="ring"><div><div class="lbl" id="cdl">Next deviation</div><div class="big" id="cdt">—</div></div></div><div class="cdm" id="cdm">Type <b>!secure</b> when it shows up</div></div>
<div id="card"><div class="tag">Spotted in the wild</div>
<div class="glow"><img id="img" alt=""></div>
<div class="name" id="name"></div><div class="variant" id="variant"></div>
<div class="cta">Type <b>!secure</b> to catch it</div>
<div class="cta dcta" id="dcta"><b>!donate</b> (up to ${require("./rarity").ECONOMY.legendaryPoolMax})</div>
<div class="bar"><i id="bar"></i></div>
<div class="count" id="count">0:00<small>left to catch</small></div>
<div id="pool"><div class="pb"><i id="poolbar"></i></div><div class="pt" id="pooltxt"></div></div></div>
<div id="res"><div class="rt" id="rt"></div><div class="glow"><img id="rimg" alt=""></div><div class="rn" id="rn"></div><div class="rr" id="rr"></div><div class="list" id="rlist"></div><div class="missed" id="rmiss"></div></div>
<script>
(function(){
  var code=${JSON.stringify(code)}, demo=${demoState}, demoResult=${demoResult}, res=document.getElementById("res"), shownResult=null, card=document.getElementById("card"), bar=document.getElementById("bar"), count=document.getElementById("count");
  function setCount(sec){ sec=Math.max(0,Math.ceil(sec)); count.firstChild.nodeValue=Math.floor(sec/60)+":"+("0"+(sec%60)).slice(-2); count.className="count"+(sec<=10?" low":""); }
  var current=null, skew=0, hideTimer=null;
  // ---- countdown version (?countdown=1): between spawns, a ring counts down to the next one (B 2026-10-08)
  var cdOn=/[?&](countdown|timer)=1/.test(location.search), cd=document.getElementById("cd"), next=null;
  function cdTick(){
    if(!cdOn)return;
    var resOn=res.className.indexOf("show")>=0, want=!current&&!resOn&&next;
    if(!want){ if(cd.className.indexOf("show")>=0) cd.className=""; return; }
    var t=document.getElementById("cdt"), l=document.getElementById("cdl"), m=document.getElementById("cdm");
    function word(w,lbl,msg){ t.textContent=w; t.className="big word"; l.textContent=lbl; m.innerHTML=msg; }
    if(!next.live) word("Offline","Deviation Hunt","Deviations appear while the stream is <b>live</b>");
    else if(!next.spawnsOn) word("Paused","Deviation Hunt","Spawns are paused right now");
    else if(next.idleChat) word("Zzz","The deviations are asleep","<b>Say hi in chat</b> to wake them up!");
    else { var left=next.at?Math.max(0,next.at-(Date.now()+skew)):null, sec=left==null?null:Math.ceil(left/1000);
      l.textContent="Next deviation"; m.innerHTML="Type <b>!secure</b> when it shows up";
      if(sec==null){t.textContent="Soon";t.className="big word";} else if(sec<=0){t.textContent="Any sec…";t.className="big word";}
      else {t.textContent=Math.floor(sec/60)+":"+("0"+(sec%60)).slice(-2);t.className="big";} }
    if(cd.className.indexOf("show")<0){ fit(cd); cd.offsetWidth; cd.className="show"; }
  }
  // ---- spawn alert sound (B 2026-10-07): synthesized in the page, so there's no file to load.
  // ?sound=0 turns it off, ?volume=0-100 (default 100). Legendary spawns (variation/skin) get a sparkle.
  // Never on the homepage previews. In OBS tick "Control audio via OBS" to put it on the mixer.
  var qs=new URLSearchParams(location.search), vol=Math.max(0,Math.min(100,parseFloat(qs.get("volume")||"100")))/100;
  var soundOn=code!=="preview"&&qs.get("sound")!=="0"&&vol>0, actx=null, firstPoll=true;
  function tone(t,f,dur,type,g0,f2){var o=actx.createOscillator(),g=actx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(g0*vol,t+0.015);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+dur+0.05);}
  // voice lines (Piper TTS, generated for the game): "A Deviation has been located." / "A Legendary Deviation has been located."
  var voice=null, voiceLeg=null;
  if(soundOn){ voice=new Audio("/panel/dh-alert.wav"); voiceLeg=new Audio("/panel/dh-alert-legendary.wav"); voice.preload=voiceLeg.preload="auto"; voice.volume=voiceLeg.volume=vol; }
  // tells the server whether the alert played (shows in the server log as [obs-sound]) — for troubleshooting
  function report(ev){ try{ fetch("/obs-source/"+encodeURIComponent(code)+"/sound?ev="+encodeURIComponent(String(ev).slice(0,120)),{method:"POST",keepalive:true}); }catch(e){} }
  function say(a,ms){ if(!a)return; setTimeout(function(){ try{ a.currentTime=0; var p=a.play(); if(p&&p.then)p.then(function(){report("voice played, ctx="+(actx&&actx.state))},function(e){report("voice blocked: "+(e&&e.name)+" "+(e&&e.message));}); }catch(e){ report("voice error: "+e.message); } }, ms); }
  function alertSound(legendary){
    if(!soundOn)return;
    try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==="suspended")actx.resume(); }catch(e){ actx=null; }
    if(actx){
      var t=actx.currentTime+0.05;
      // scanner ping: low thump + two rising blips
      tone(t,150,0.35,"sine",0.8,60);
      tone(t+0.02,880,0.28,"sine",0.6);tone(t+0.02,1760,0.18,"triangle",0.08);
      tone(t+0.32,1320,0.45,"sine",0.6);tone(t+0.32,2640,0.25,"triangle",0.08);
      if(legendary){ // golden sparkle before the voice
        [1046.5,1318.5,1568,2093,2637].forEach(function(f,i){tone(t+0.8+i*0.09,f,0.6,"triangle",0.22);tone(t+0.8+i*0.09,f*2,0.35,"sine",0.05);});
      }
    }
    say(legendary?voiceLeg:voice, legendary?1450:800);
  }
  function setPool(p){
    var el=document.getElementById("pool");
    var dc=document.getElementById("dcta");
    if(!p){ dc.className="cta dcta"; if(el.className.indexOf("on")>=0){el.className="";fit(card);} return; }
    dc.className="cta dcta"+(p.full?"":" on");
    var was=el.className.indexOf("on")>=0;
    el.className="on"+(p.full?" full":"");
    document.getElementById("poolbar").style.width=Math.min(100,p.total/p.goal*100).toFixed(1)+"%";
    document.getElementById("pooltxt").textContent=p.full?"\u2705 POOL FULL \u2014 donors who !secure catch it!":"\ud83d\udcb0 Pool "+p.total.toLocaleString("en-US")+" / "+p.goal.toLocaleString("en-US")+(p.bonus?" \u00b7 +"+(+(p.bonus*100).toFixed(2))+"%":"");
    if(!was)fit(card);
  }
  function show(s,quiet){
    setPool(s.pool||null);
    if(current&&current.id===s.id){current=s;return;}
    current=s;
    if(!quiet)alertSound(!!s.variant);
    document.getElementById("img").src=s.img;
    document.getElementById("name").textContent=s.name;
    document.getElementById("variant").textContent=s.variant?("\\u2728 "+(s.variant.kind==="skin"?"Skin":"Variation")+": "+s.variant.name):"";
    card.className=(s.variant?s.variant.kind:""); fit(card); card.offsetWidth; card.className+=" show";
  }
  function hide(){current=null;card.className=(card.className||"").replace("show","").trim();}
  // scale a card so it fills the whole Browser Source (e.g. 600x600), whatever its content height
  function fit(el){ var w=el.offsetWidth, h=el.offsetHeight; if(!w||!h)return; el.style.setProperty("--s", Math.min(innerWidth*.97/w, innerHeight*.97/h)); }
  addEventListener("resize",function(){fit(card);fit(res);fit(cd);});
  function txt(id,t){document.getElementById(id).textContent=t;}
  // "who caught it" card, shown for a few seconds after the deviation is gone
  function showResult(r){
    if(shownResult===r.id)return; shownResult=r.id; hide();
    var won=r.winners&&r.winners.length, legend=r.legend!=null?r.legend:!!r.variant;
    var star=legend?"\ud83c\udf1f":"\u2b50", stars=new Array(r.stars+1).join(star);
    txt("rt", won?(legend?star+" LEGENDARY SECURED! "+star:stars+" SECURED! "+stars):(r.tried?"\ud83d\udca5 GOT AWAY!":"\ud83d\udca8 SLIPPED AWAY"));
    document.getElementById("rimg").src=r.img; txt("rn",r.name); txt("rr",(r.variant?r.variant+" \u00b7 ":"")+r.tierLabel+" \u00b7 +"+r.reward);
    var list=document.getElementById("rlist"); list.innerHTML="";
    (r.winners||[]).slice(0,4).forEach(function(w){var d=document.createElement("div");d.className="row"+(w.variant?" lg":"");var lc=document.createElement("div");lc.className="who";var nb=document.createElement("b");nb.textContent="@"+w.name;lc.appendChild(nb);if(w.variant){var vv=document.createElement("i");vv.textContent=w.variant;lc.appendChild(vv);}d.appendChild(lc);var sp=document.createElement("span");sp.textContent=w.rating;d.appendChild(sp);list.appendChild(d);});
    if((r.winners||[]).length>4){var m=document.createElement("div");m.className="more";m.textContent="+"+(r.winners.length-4)+" more";list.appendChild(m);}
    var esc=r.escaped||[]; txt("rmiss", esc.length?("\ud83d\udca5 "+(won?"Broke free from ":"Got away from ")+esc.slice(0,4).join(", ")+(esc.length>4?" +"+(esc.length-4)+" more":"")):(r.tried?"":"Nobody tried to secure it"));
    res.className=(won?(legend?"legend":""):"miss")+((r.winners||[]).length>=3?" many":""); fit(res); res.offsetWidth; res.className+=" show";
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
      if(s.now)skew=s.now-Date.now();
      next=s.next||null;
      if(s.active){hideResult();show(s,firstPoll);} // no sound for one already loose when the source loads
      else { if(current)hide(); if(s.result)showResult(s.result); else hideResult(); }
      cdTick();
      firstPoll=false;
    }).catch(function(){}).then(function(){setTimeout(poll,1500);});
  }
  setInterval(tick,100); setInterval(cdTick,500);
  if(demo==="countdown"){cdOn=true;next={live:true,spawnsOn:true,idleChat:false,at:Date.now()+272000};cdTick();}
  else if(demoResult)showResult(demoResult);else if(demo)show(demo);else poll();
})();
</script></body></html>`;
}

function mount(app, pool) {
  // troubleshooting beacon from the page: did the spawn alert play?
  app.post("/obs-source/:code/sound", (req, res) => {
    const bid = channelForCode(String(req.params.code).toLowerCase());
    if (bid) console.log(`[obs-sound] ${bid}: ${String(req.query.ev || "").slice(0, 120)}`);
    res.status(204).end();
  });
  app.get("/obs-source/:code/state", (req, res) => {
    res.set("Cache-Control", "no-store");
    const st = stateFor(pool, req.params.code, { bar: req.query.bar === "1" });
    res.status(st.ok ? 200 : 404).json(st);
  });
  // public preview for the homepage: /obs-preview?kind=base|variation|skin
  app.get("/obs-preview", (req, res) => {
    const kind = ["base", "variation", "skin", "result", "resultlegend", "resultmiss", "countdown"].includes(req.query.kind) ? req.query.kind : "base";
    res.set("Cache-Control", "public, max-age=300");
    res.send(page("preview", kind));
  });
  // Progress bar (B 2026-10-10): /obs-source/<code>/bar — a see-through bar that fills up until the next deviation.
  app.get("/obs-source/:code/bar", (req, res) => {
    const code = String(req.params.code).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (code !== "demo" && !channelForCode(code)) return res.status(404).send("Unknown OBS Source link. A mod can get the right one by typing !hunt obs in chat.");
    res.set("Cache-Control", "no-store").send(barPage(code));
  });
  app.get("/obs-source/:code", (req, res) => {
    const code = String(req.params.code).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!channelForCode(code)) return res.status(404).send("Unknown OBS Source link. A mod can get the right one by typing !hunt obs in chat.");
    res.set("Cache-Control", "no-store");
    // ?demo=1 sample card · ?demo=base = normal spawn + alert · ?demo=variation / skin = Legendary spawn + alert · ?demo=result
    const d = req.query.demo;
    res.send(page(code, d === "result" ? "result" : d === "base" || d === "variation" || d === "skin" || d === "countdown" ? d : d === "1"));
  });
}

// ---- the progress-bar OBS source: just a bar, see-through, filling up as the next deviation gets closer ----
// Empty right after a spawn, full when the next one is due. While a deviation is loose it says so (full, pulsing).
// Fills the whole Browser source (recommended 600 × 50). ?demo in the code ("demo") shows a 60-second sample loop.
function barPage(code) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Deviation Hunt — Next Deviation</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:"Segoe UI",system-ui,"Noto Sans",sans-serif}
#bar{position:absolute;inset:4px;border-radius:999px;background:rgba(10,18,28,.55);border:2px solid rgba(255,255,255,.18);overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.35)}
#fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;background:linear-gradient(90deg,rgba(14,165,233,.75),rgba(34,211,238,.9));transition:width 1s linear}
#bar.loose #fill{background:linear-gradient(90deg,rgba(242,192,52,.85),rgba(253,224,71,.95));animation:pulse 1.2s ease-in-out infinite}
#bar.idle #fill{background:rgba(148,163,184,.35)}
@keyframes pulse{50%{opacity:.6}}
#txt{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 4%;color:#fff;font-weight:900;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 1px 3px rgba(0,0,0,.8);font-size:var(--fs,18px);white-space:nowrap}
</style></head><body><div id="bar"><div id="fill"></div><div id="txt"><span id="l">Next Deviation</span><span id="r"></span></div></div>
<script>
(function(){
  var code=${JSON.stringify(code)}, st=null, skew=0, bar=document.getElementById("bar"), fill=document.getElementById("fill"), L=document.getElementById("l"), R=document.getElementById("r"), v=null;
  function size(){ document.documentElement.style.setProperty("--fs", Math.max(10, Math.min(innerHeight*0.42, innerWidth/22))+"px"); }
  addEventListener("resize", size); size();
  function draw(){
    if(!st) return;
    var now=Date.now()+skew;
    if(st.active){ bar.className="loose"; fill.style.width="100%"; L.textContent="Deviation spotted!"; R.textContent="!secure"; return; }
    var n=st.next||{};
    if(!n.live||!n.spawnsOn||n.idleChat){ bar.className="idle"; fill.style.width="0%"; L.textContent=!n.live?"Deviation Hunt":!n.spawnsOn?"Spawns paused":"Say hi to wake them"; R.textContent=!n.live?"offline":""; return; }
    bar.className=""; L.textContent="Next Deviation";
    if(!n.at){ fill.style.width="0%"; R.textContent="soon"; return; }
    var from=n.from||(n.at-600000), p=Math.max(0,Math.min(1,(now-from)/Math.max(1,n.at-from))), left=Math.max(0,Math.ceil((n.at-now)/1000));
    fill.style.width=(p*100).toFixed(2)+"%";
    R.textContent=left>0?Math.floor(left/60)+":"+("0"+(left%60)).slice(-2):"any sec…";
  }
  async function poll(){
    if(code==="demo"){ var t=Date.now(), cyc=60000, start=t-(t%cyc); st={active:(t%cyc)>50000,next:{live:true,spawnsOn:true,idleChat:false,from:start,at:start+50000}}; draw(); return; }
    try{ var r=await fetch("/obs-source/"+encodeURIComponent(code)+"/state?bar=1",{cache:"no-store"}); if(!r.ok) return; var d=await r.json();
      if(v&&d.v&&d.v!==v){ location.reload(); return; } v=d.v; if(d.now) skew=d.now-Date.now(); st=d; draw(); }catch(e){}
  }
  poll(); setInterval(poll, 3000); setInterval(draw, 1000);
})();
</script></body></html>`;
}

module.exports = { BOOT,  mount, stateFor, linkFor, codeFor };
