// scripts/ext-icons.js — renders the extension's logo (100x100) and taskbar icon (24x24):
// an original "containment unit" mark, a hex capsule holding a glowing core.
//   node scripts/ext-icons.js <outDir>
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const outDir = process.argv[2] || "docs/ext-assets";
fs.mkdirSync(outDir, { recursive: true });

const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 180 * (60 * i - 90);
  return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

// full logo
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<defs>
  <radialGradient id="bg" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#143a55"/><stop offset=".6" stop-color="#0d1319"/></radialGradient>
  <radialGradient id="core" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#7dd3fc"/><stop offset="1" stop-color="#0ea5e9" stop-opacity="0"/></radialGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="100" height="100" fill="url(#bg)"/>
<!-- corner brackets: the scanner frame -->
<g stroke="#0ea5e9" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85">
  <path d="M12 26 V12 H26"/><path d="M74 12 H88 V26"/><path d="M88 74 V88 H74"/><path d="M26 88 H12 V74"/>
</g>
<!-- containment capsule -->
<polygon points="${hex(50, 50, 30)}" fill="#0f1c27" stroke="#0ea5e9" stroke-width="3.5" stroke-linejoin="round" filter="url(#glow)"/>
<polygon points="${hex(50, 50, 22)}" fill="none" stroke="#7dd3fc" stroke-width="1.5" stroke-dasharray="4 3" opacity=".7"/>
<!-- glowing anomaly core -->
<circle cx="50" cy="50" r="17" fill="url(#core)"/>
<circle cx="50" cy="50" r="6.5" fill="#e0f7ff" filter="url(#glow)"/>
<!-- lock pins -->
<g fill="#fbbf24"><circle cx="50" cy="20" r="3"/><circle cx="50" cy="80" r="3"/></g>
</svg>`;

// simplified for 24px: bold hex + core only
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
<rect width="24" height="24" fill="#0d1319"/>
<polygon points="${hex(12, 12, 10)}" fill="#0f1c27" stroke="#0ea5e9" stroke-width="2" stroke-linejoin="round"/>
<circle cx="12" cy="12" r="4.2" fill="#7dd3fc"/>
<circle cx="12" cy="12" r="2" fill="#ffffff"/>
</svg>`;

(async () => {
  const b = await chromium.launch();
  for (const [svg, size, name] of [[logo, 100, "logo-100.png"], [icon, 24, "icon-24.png"]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<body style="margin:0">${svg}</body>`);
    await p.screenshot({ path: path.join(outDir, name) });
    await p.close();
  }
  await b.close();
  fs.writeFileSync(path.join(outDir, "logo.svg"), logo);
  console.log("done");
})();
