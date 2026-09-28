// scripts/ext-assets.js — renders the Twitch extension listing images from the real panel UI.
//
//   node scripts/ext-assets.js <imgDir> <outDir>
//
// imgDir: local copies of the wiki deviation images (file names as on the wiki).
// Output: logo-100.png, icon-24.png, discovery-300x200.png, screenshot-1024x768.png
for (const k of ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "ADMIN_KEY"]) process.env[k] ||= "assets";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const traits = require("../traits");
const devs = require("../combat-fallback.json");

const [imgDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const EXT = path.join(__dirname, "..", "ext");
const local = (url) => {
  const f = path.join(imgDir, decodeURIComponent(url.split("/").pop()));
  return fs.existsSync(f) ? "data:image/png;base64," + fs.readFileSync(f).toString("base64") : url;
};
const byName = (n) => devs.find((d) => d.name === n);

// ---------- a believable sample collection ----------
function sampleBag() {
  const own = {
    "Grumpy Bulb": { n: 4, variant: "Violet Robe" }, "Butterfly Emissary": { n: 3 }, "Flame Essence": { n: 5 },
    "Pyro Dino": { n: 1 }, "Whalepup": { n: 2 }, "Disco Ball": { n: 2 }, "Buzzy Bee": { n: 3 }, "Mini Feaster": { n: 2 },
    "Zapamander": { n: 1 }, "Voodoo Doll": { n: 2 }, "Dr. Teddy": { n: 1 }, "Polar Jelly": { n: 1 }, "Snowsprite": { n: 1 },
    "Electric Eel": { n: 2 }, "Growshroom": { n: 1 }, "By-the-Wind": { n: 2 }, "Lonewolf Whisper": { n: 1 }, "Rain Man": { n: 1 },
  };
  // give one deviation a caught skin, if the data has one
  const skinDev = devs.find((d) => own[d.name] && !own[d.name].variant && d.variants.some((v) => v.kind === "skin"));
  if (skinDev) own[skinDev.name].variant = skinDev.variants.find((v) => v.kind === "skin").name;

  const deviations = devs.map((d) => {
    const o = own[d.name];
    let best = null;
    if (o) {
      const sp = traits.rollSpecimen(d.name, o.variant || "", d.variants.map((v) => v.name), d.category);
      sp.power = Math.max(sp.power, 3); sp.mood = Math.max(sp.mood, 2);
      if (d.name === "Grumpy Bulb") { sp.power = 5; sp.mood = 4; }
      best = {
        variant: o.variant || null, skill: sp.power, activity: sp.mood,
        traits: [[1, sp.t1, sp.t1_level], [2, sp.t2, null], [3, sp.t3, null]].map(([slot, key, lvl]) => ({
          slot, name: traits.traitName(slot, key, lvl, o.variant, d.category), effect: traits.traitEffect(slot, key, lvl, o.variant, d.category),
        })),
      };
    }
    return {
      id: d.id, name: d.name, category: d.category, img: local(d.img), owned: !!o, count: o ? o.n : 0,
      variantsOwned: o?.variant ? [o.variant] : [], variantsTotal: d.variants.length,
      variants: d.variants.map((v) => ({ name: v.name, kind: v.kind, img: v.img ? local(v.img) : null, owned: o?.variant === v.name })),
      best,
    };
  });
  const owned = deviations.filter((d) => d.owned);
  return {
    player: { login: "meta_hunter", display: "Meta_Hunter", starchrom: 1840, units: 7 },
    stats: { unique: owned.length, total: owned.reduce((s, d) => s + d.count, 0), variants: owned.filter((d) => d.variantsOwned.length).length, all: devs.length, allVariants: devs.reduce((s, d) => s + d.variants.length, 0) },
    page: "https://deviationhunt.ohwikiguide.com/u/meta_hunter",
    deviations,
  };
}

// the panel exactly as shipped, with Twitch + the API mocked
function panelHtml(bag, openId) {
  const css = fs.readFileSync(path.join(EXT, "panel.css"), "utf8");
  const js = fs.readFileSync(path.join(EXT, "panel.js"), "utf8");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body class="dark">
<header><div class="title">Deviation Bag</div><div id="who" class="who"></div></header><main id="app"></main>
<script>
window.Twitch = { ext: { onContext(cb){ cb({ theme: "dark" }); }, onAuthorized(cb){ setTimeout(() => cb({ token: "x" }), 0); }, actions: { requestIdShare(){} } } };
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(${JSON.stringify(bag)}) });
</script><script>${js}</script>
${openId ? `<script>setTimeout(() => { const c = document.querySelector('.dev[data-id="${openId}"]'); c && c.click(); }, 300);</script>` : ""}
</body></html>`;
}

(async () => {
  await traits.refresh();
  const bag = sampleBag();
  const browser = await chromium.launch();
  const shot = async (html, w, h, file, scale = 2, wait = 600) => {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
    await p.setContent(html, { waitUntil: "load" });
    await p.waitForTimeout(wait);
    await p.screenshot({ path: file });
    await p.close();
    return file;
  };
  const b64 = (f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");

  // panel views (panel is 318 px wide on Twitch; 500 tall as configured)
  const grid = await shot(panelHtml(bag), 318, 500, path.join(outDir, "_panel-grid.png"));
  const detail = await shot(panelHtml(bag, "grumpybulb"), 318, 500, path.join(outDir, "_panel-detail.png"));

  const font = `font-family:Inter,system-ui,Segoe UI,Roboto,sans-serif;`;
  const bg = `background:radial-gradient(circle at 20% 0%,#12324a 0%,#0d1319 55%);`;

  // 1024x768 screenshot: two real panel views plus a caption
  await shot(`<body style="margin:0;width:1024px;height:768px;${bg}${font}color:#e6edf3;display:flex;align-items:center;gap:28px;padding:0 36px;box-sizing:border-box;">
    <div style="flex:1;">
      <div style="color:#0ea5e9;font-weight:800;letter-spacing:1px;font-size:14px;">TWITCH PANEL</div>
      <div style="font-size:30px;font-weight:800;margin:6px 0 14px;line-height:1.15;">Your Deviation Bag on every stream</div>
      <div style="color:#93a4b5;font-size:16px;line-height:1.6;">Every Once Human deviation you've secured in chat with <b style="color:#e6edf3">!secure</b> — Skill &amp; Activity Ratings, traits, and the variations and skins you've caught.</div>
    </div>
    ${[grid, detail].map((f) => `<img src="${b64(f)}" style="width:318px;height:500px;border-radius:10px;border:1px solid #26333f;box-shadow:0 20px 50px rgba(0,0,0,.5);">`).join("")}
  </body>`, 1024, 768, path.join(outDir, "screenshot-1024x768.png"), 1);

  const hero = local(byName("Grumpy Bulb").img);
  const trio = ["Flame Essence", "Grumpy Bulb", "Pyro Dino"].map((n) => local(byName(n).img));

  // 100x100 logo
  await shot(`<body style="margin:0;width:100px;height:100px;${bg}display:flex;align-items:center;justify-content:center;">
    <img src="${hero}" style="width:88px;height:88px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(14,165,233,.6));"></body>`, 100, 100, path.join(outDir, "logo-100.png"), 1);

  // 24x24 taskbar icon
  await shot(`<body style="margin:0;width:24px;height:24px;background:#0d1319;display:flex;align-items:center;justify-content:center;">
    <img src="${hero}" style="width:24px;height:24px;object-fit:contain;"></body>`, 24, 24, path.join(outDir, "icon-24.png"), 1);

  // 300x200 discovery image
  await shot(`<body style="margin:0;width:300px;height:200px;${bg}${font}color:#e6edf3;text-align:center;box-sizing:border-box;padding-top:18px;">
    <div style="display:flex;justify-content:center;align-items:flex-end;gap:2px;height:96px;">
      ${trio.map((s, i) => `<img src="${s}" style="width:${i === 1 ? 96 : 76}px;height:${i === 1 ? 96 : 76}px;object-fit:contain;">`).join("")}
    </div>
    <div style="font-size:26px;font-weight:800;margin-top:10px;">Deviation Hunt</div>
    <div style="color:#0ea5e9;font-size:13px;font-weight:700;margin-top:2px;">Catch Once Human deviations in chat</div>
  </body>`, 300, 200, path.join(outDir, "discovery-300x200.png"), 1);

  await browser.close();
  for (const f of ["_panel-grid.png", "_panel-detail.png"]) fs.unlinkSync(path.join(outDir, f));
  console.log("written to", outDir);
})().catch((e) => { console.error(e); process.exit(1); });
