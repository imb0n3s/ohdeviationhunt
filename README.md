# Deviation Hunt — a Once Human catching game for Twitch chat

Like Pokémon Community Game, but with Once Human's deviations (all 61: combat, crafting, territory). While a channel is live,
a deviation "breaches containment" in chat every ~7 minutes; viewers type `!secure` to throw a
Securement Unit. Collections, Starchrom and Units are global per Twitch user, so they follow a
viewer to every channel that runs the game.

Deviations, variations and skins are read live from
https://ohwikiguide.com/Deviation_Main_Page (`combatData`, `craftingData`, `territoryData`, `deviationVariations`, `deviationSkins`)
every 6 hours — add a deviation to the wiki and it joins the game. `combat-fallback.json` is the
snapshot used if the wiki is unreachable.

## Commands
Viewers: `!secure [standard|advanced|elite|anomaly]` (alias `!catch`), `!units`, `!shop`,
`!buy <unit> <n>`, `!daily`, `!deviationbag [user]`, `!scrap`, `!traits [name]`, `!dev <name>`, `!hunttop`, `!hunt`.
Mods: `!hunt spawn`, `!hunt interval <min>`, `!hunt off|on`, `!hunt status`, `!hunt leave`.
In the bot's own channel: `!join`, `!leave`.

## Specimens & traits
Every secured deviation is its own specimen with a Skill Rating (Deviant Power) 1-5, an Activity
Rating (Mood) 1-5 and three traits, using the Trait Page slots for its type (combat/crafting/territory). Traits follow https://ohwikiguide.com/Deviation_Trait_Page exactly (read live, snapshot in
`traits-fallback.json`): Slot 1 = a Global trait or the deviation's own Slot 1 trait; Slot 2 = a
generic combat trait or the deviation's own specific ones (never another deviation's); Slot 3 =
a combat fused trait. A deviation's own trait that belongs to a variation or skin (e.g. Grumpy
Bulb - Violet Robe) only appears on that variant, and that variant always has it.
`npm run test:traits` checks 46,000 rolls against those rules.
`!traits [name]` shows a specimen; `!scrap` keeps the best Power+Mood of each.

## Balance
All tuning (rarity tiers, which deviation is which tier, catch odds, prices, rewards, daily)
lives in `rarity.js`.

## Web
`/` add-to-Twitch page + guide · `/u/<login>` a viewer's Deviation Bag · `/top` leaderboard ·
`/dex` all deviations · `/setup?key=ADMIN_KEY` log in as the bot account · `/admin?key=ADMIN_KEY`.

## Deploy (Railway)
Own Twitch dev app (redirect `<BASE_URL>/auth/callback`), a volume at `/data`, env vars from
`.env.example`, then open `/setup?key=...` and log in as the bot's Twitch account.
Test locally with `npm test` (simulated chat).

## Twitch panel extension (Deviation Bag)
`ext/` holds the panel (panel.html/js/css — no inline scripts or styles, Twitch CSP). It calls
`GET /ext/bag` with the Twitch extension JWT; the server verifies it with `EXT_SECRET` (the
extension secret from the Twitch dev console, base64) and returns the viewer's global bag.
Viewers share their identity once (Twitch requirement). Upload `ext/` zipped (`npm run zip:ext`)
as the extension's assets. Console settings: Panel view, panel height 500, identity linking on,
URL fetching allowlist `https://deviationhunt.ohwikiguide.com` (and the old `https://ohdeviationhunt-production.up.railway.app`), image allowlist
`https://ohwikiguide.com`.

## Wiki guide

The player guide at https://ohwikiguide.com/Deviation_Hunt is generated from the game's own settings:

```
npm run wiki   # writes docs/Deviation_Hunt.wiki
```

Re-generate and re-publish it whenever balance, commands, traits or the economy change.
