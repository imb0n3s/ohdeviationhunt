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
- Every deploy restarts the server (~30-60s offline; the volume prevents overlap). Railway Watch
  Paths skip deploys for docs/, scripts/, test/, ext/ and *.md changes. Batch server changes.
