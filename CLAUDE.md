# Deviation Hunt — working notes

- After ANY change to gameplay, commands, balance (rarity.js), economy, traits, spawn timing,
  the collection page or the Twitch panel: update scripts/wiki-page.js if wording changed,
  run `npm run wiki`, commit and push. The WIKI REPUBLISHES ITSELF: on every deploy wikisync.js runs
  scripts/wiki-page.js and edits https://ohwikiguide.com/Deviation_Hunt via api.php with a bot password
  (Railway env WIKI_BOT_USER / WIKI_BOT_PASS; only edits when the text changed; check the deploy log for
  "[wiki] sync"). A push that ONLY touches scripts/ does not redeploy (watch paths) — bundle it with a
  root-file change or the wiki won't update. Fallback if the env vars are missing: api.php action=edit from
  B's logged-in browser, text from raw.githubusercontent.com/imb0n3s/ohdeviationhunt/<commit>/docs/Deviation_Hunt.wiki.
- Pushing to main auto-deploys on Railway.
- Twitch extension edits (details, images, zip upload) need the version in Local Test. Afterwards,
  move it back to Hosted Test (the button opens a "Move" confirm dialog — click it), then RELOAD the status page and confirm "Current Status: Hosted Test"
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
  An HOURLY scheduled task ("Deviation Hunt: hourly Twitch tester check", trig_01LiwN3w1y6fy7RZGGNND3XB, 2026-10-04)
  does this automatically via Claude in Chrome; it only opens the console when someone is missing.
- Bits: panel Shop sells Starchrom packs for Bits (rarity.js BITS_PACKS, 1 Bit = 5 Starchrom; receipts verified at
  POST /ext/bits/complete, one credit per transactionId in bits_tx). Hidden until Twitch Bits is on. TO SWITCH ON (after B
  finishes Monetization onboarding): Local Test → Monetization tab → "Bits enabled" → add one product per pack with the
  SAME sku + Bits amount (starchrom25/5, starchrom125/25, starchrom250/50, starchrom500/100, starchrom2500/500, starchrom5000/1000, starchrom10000/2000, starchrom17500/3500, pods5/50), In Development = No,
  Save All → back to Hosted Test (reload/confirm) → set BITS_ENABLED=1 → RAISE GLOVE PRICES (rarity.js GLOVES:
  Rustic 5,000 = $10, BBQ 10,000 = $20, Savior 17,500 = $35; B 2026-09-30) → add Bits to the wiki page.
  Server kill switch: Bits are refused unless Railway env BITS_ENABLED=1 (unset = off; packs hidden, /ext/bits/complete → 403) —
  set it only when switching Bits on. B's call (2026-09-28): DON'T switch Bits on until it takes real Bits — i.e. after the extension is
  approved/released (in Local/Hosted Test Twitch makes Bits purchases free). Onboarding was submitted 2026-09-28.
- Pod cap: ECONOMY.unitCap = 100 Securement Pods = caught deviations + empty Securement Units (+ players.extra_cap). Extra room is sold for Bits:
  pods5 = +5 capacity for 50 Bits (in BITS_PACKS; decided by B 2026-09-28). When switching Bits on, the Twitch
  products are: starchrom25/5, starchrom125/25, starchrom250/50, starchrom500/100, starchrom2500/500, starchrom5000/1000, starchrom10000/2000, starchrom17500/3500 AND pods5/50.
- B's call (2026-09-29): keep the extension in HOSTED TEST; only go to Local Test briefly to add testers / upload, then
  straight back (reload + confirm). In Local Test the panel is blank for everyone. (web.js also serves ext/ at /panel —
  unused for now; it would let Local Test work if Asset Hosting → Testing Base URI pointed at <BASE_URL>/panel/.)
- Twitch console: extension client id 73v1sq51zyzp7r1fjn5y6wg8ccpjtc, version 0.0.1
  (https://dev.twitch.tv/console/extensions/73v1sq51zyzp7r1fjn5y6wg8ccpjtc/0.0.1/status). Zip upload from a
  cloud session: fetch the committed docs/ext-assets/deviation-bag-panel.zip from raw.githubusercontent.com in the
  console tab, put it on the Files tab's input[type=file] via DataTransfer, dispatch change, click "Upload Assets",
  then check the MD5 shown matches `md5sum deviation-bag-panel.zip`.
- B's decisions (2026-09-30 → 10-03), not obvious from code:
  - Variations/skins are SECRET: rolled per spawn (variation 1 in 30, skin 1 in 75, Chaos 1 in 750) with their own
    capture rates (12% / 9% / 2.5%), but chat, throw replies and the OBS countdown always show the normal deviation;
    only the result reveals "it was a ✨ Variation: X (Legendary)!" (also when it gets away).
  - Catch banner: one ⭐ for a normal catch; 🌟×5 LEGENDARY only for variations/skins/Chaos. No rarity label on
    normal catches.
  - Chat delay default 14s (RESULT_CHAT_DELAY_SECONDS) while a channel's OBS Source is open: spawn announcement and
    result both wait; the catch window is silently extended by the delay (overlay counts down the normal 90s;
    never mention the extra time).
  - OBS Source cards scale to fill the whole browser source (600×600 recommended).
  - Best specimen order: skin > variation > Legendary trait (Upper Hand, Power Rewind 2) > Skill+Activity > traits.
  - Leaderboard: Top Streams (most deviations secured per channel) above one Top 100 with a Streamer tag.
  - Homepage stats: Channels · Metas · Deviations Secured · Deviations Attempted (all !secure throws) · Deviations ·
    Starchrom spent (capitalized).
