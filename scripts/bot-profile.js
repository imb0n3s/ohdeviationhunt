// scripts/bot-profile.js — images for the ohdeviationhunt Twitch profile (avatar + 3 About panels)
const fs = require("fs"), path = require("path"), { chromium } = require("playwright");
const out = path.join(__dirname, "..", "docs", "bot-profile");
const pod = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "docs", "ext-assets", "pod-soul.png")).toString("base64");
const bg = "background:radial-gradient(circle at 30% 10%,#12324a 0%,#0d1319 60%);";
const font = "font-family:Inter,'Segoe UI',system-ui,Roboto,sans-serif;";
const panel = (icon, title, sub) => `<body style="margin:0;width:320px;height:100px;${bg}${font}color:#e6edf3;display:flex;align-items:center;gap:12px;padding:0 16px;box-sizing:border-box;border-bottom:3px solid #0ea5e9">
  <div style="font-size:40px;width:52px;text-align:center">${icon}</div>
  <div><div style="font-size:23px;font-weight:900;line-height:1.1">${title}</div><div style="color:#7dd3fc;font-size:13px;font-weight:700;margin-top:4px">${sub}</div></div></body>`;
(async () => {
  const b = await chromium.launch();
  const shot = async (html, w, h, file) => { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(html); await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, file) }); await p.close(); };
  await shot(`<body style="margin:0;width:600px;height:600px;${bg}display:flex;align-items:center;justify-content:center"><img src="${pod}" style="height:520px;filter:drop-shadow(0 0 28px rgba(14,165,233,.55))"></body>`, 600, 600, "avatar-600.png");
  await shot(panel("🎯", "Deviation Hunt", "How to play · deviationhunt.ohwikiguide.com"), 320, 100, "panel-about.png");
  await shot(panel("📺", "Where to Play", "Every channel running the game"), 320, 100, "panel-channels.png");
  await shot(panel("🏆", "Leaderboard", "Top Metas by deviations secured"), 320, 100, "panel-top.png");
  await shot(panel("🌐", "Website", "Home · add the game to your channel"), 320, 100, "panel-website.png");
  await shot(panel("⌨️", "Commands", "Every chat &amp; streamer command"), 320, 100, "panel-commands.png");
  // the game's photo (no web address): pod with Soul Summoner + name
  await shot(`<body style="margin:0;width:320px;height:220px;${bg}${font}color:#e6edf3;display:flex;align-items:center;gap:6px;padding:0 14px;box-sizing:border-box;border-bottom:3px solid #0ea5e9">
    <img src="${pod}" style="height:200px;filter:drop-shadow(0 0 14px rgba(14,165,233,.55))">
    <div><div style="font-size:26px;font-weight:900;line-height:1.05">Deviation<br>Hunt</div><div style="color:#7dd3fc;font-size:13px;font-weight:700;margin-top:6px">Catch Once Human deviations in Twitch chat</div></div></body>`, 320, 220, "panel-game.png");
  await b.close(); console.log("written to", out);
})();
