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
- Bits: panel Shop sells Starchrom packs for Bits (rarity.js BITS_PACKS, 1 Bit = 4 Starchrom (Savior Gloves = 2,500 Bits = $25); receipts verified at
  POST /ext/bits/complete, one credit per transactionId in bits_tx). Hidden until Twitch Bits is on. TO SWITCH ON (after B
  finishes Monetization onboarding): Local Test → Monetization tab → "Bits enabled" → add one product per pack with the
  SAME sku + Bits amount (starchrom20/5, starchrom100/25, starchrom200/50, starchrom400/100, starchrom2000/500, starchrom10000/2500, pods5/50), In Development = No,
  Save All → back to Hosted Test (reload/confirm) → add Bits to the wiki page.
  B's call (2026-09-28): DON'T switch Bits on until it takes real Bits — i.e. after the extension is
  approved/released (in Local/Hosted Test Twitch makes Bits purchases free). Onboarding was submitted 2026-09-28.
- Pod cap: ECONOMY.unitCap = 100 Securement Pods = caught deviations + empty Securement Units (+ players.extra_cap). Extra room is sold for Bits:
  pods5 = +5 capacity for 50 Bits (in BITS_PACKS; decided by B 2026-09-28). When switching Bits on, the Twitch
  products are: starchrom20/5, starchrom100/25, starchrom200/50, starchrom400/100, starchrom2000/500, starchrom10000/2500 AND pods5/50.
- B's call (2026-09-29): keep the extension in LOCAL TEST during testing (until B says otherwise) so testers can be
  added any time. Local Test loads the panel from Asset Hosting → Testing Base URI = https://deviationhunt.ohwikiguide.com/panel/
  (web.js serves ext/ at /panel; the Dockerfile copies ext/). So panel changes go live on the next Railway deploy — no zip
  upload needed while in Local Test — but ext/ is not a Railway watch path: a push that only touches ext/ won't redeploy
  (ship it with a root .js change, or B adds /ext/** to Watch Paths). Keep the zip in docs/ext-assets/ current for Hosted Test/review.
