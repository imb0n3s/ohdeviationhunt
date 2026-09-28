# Deviation Hunt — working notes

- After ANY change to gameplay, commands, balance (rarity.js), economy, traits, spawn timing,
  the collection page or the Twitch panel: update scripts/wiki-page.js if wording changed,
  run `npm run wiki`, commit, and republish https://ohwikiguide.com/Deviation_Hunt
  (MediaWiki api.php action=edit from the owner's logged-in browser session; text fetched
  from raw.githubusercontent.com/imb0n3s/ohdeviationhunt/<commit>/docs/Deviation_Hunt.wiki).
- Pushing to main auto-deploys on Railway.
- Twitch extension edits (details, images, zip upload) need the version in Local Test. Afterwards,
  move it back to Hosted Test, then RELOAD the status page and confirm "Current Status: Hosted Test"
  (the move can silently fail); in Local Test the panel loads from localhost and shows blank.
  Panel zip: `npm run zip:ext`, commit a copy to docs/ext-assets/ (git add -f), upload in the Files tab.
- Site lives at https://deviationhunt.ohwikiguide.com (Railway custom domain; Cloudflare CNAME
  deviationhunt -> wlw9g11p.up.railway.app, DNS only). BASE_URL env is set to it. The old
  *.up.railway.app address 301-redirects pages; /ext, /auth, /health still answer there.
  Twitch app redirect URLs and the extension allowlists include both addresses.
- Every deploy restarts the server (a few seconds offline; the volume prevents overlap). Railway Watch
  Paths = /*.js, /*.json, /Dockerfile (what the Dockerfile copies), so docs/, scripts/, test/, ext/
  and *.md pushes don't redeploy. A NEW server file outside the repo root would need a new pattern.
  (Negation patterns like !/docs/** broke detection — don't use them.) Batch server changes.
- Twitch panel testers: while the extension is in Hosted Test, only allowlisted accounts see the panel.
  B wants EVERY player on the Testing Account Allowlist. Each session: compare
  https://deviationhunt.ohwikiguide.com/api/players with docs/tester-allowlist.txt, add anyone new in the
  console (Access tab — only editable in Local Test: move to Local Test, add, Save, reload to verify, move
  back to Hosted Test, reload and confirm), then update docs/tester-allowlist.txt.
- Bits: panel Shop sells Starchrom packs for Bits (rarity.js BITS_PACKS, 5 Bits = 100 Starchrom; receipts verified at
  POST /ext/bits/complete, one credit per transactionId in bits_tx). Hidden until Twitch Bits is on. TO SWITCH ON (after B
  finishes Monetization onboarding): Local Test → Monetization tab → "Bits enabled" → add one product per pack with the
  SAME sku + Bits amount (starchrom100/5, starchrom500/25, starchrom1000/50, starchrom2000/100), In Development = No,
  Save All → back to Hosted Test (reload/confirm) → add Bits to the wiki page.
  B's call (2026-09-28): DON'T switch Bits on until it takes real Bits — i.e. after the extension is
  approved/released (in Local/Hosted Test Twitch makes Bits purchases free). Onboarding was submitted 2026-09-28.
