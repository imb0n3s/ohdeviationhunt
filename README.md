# Deviation Hunt — a Once Human catching game for Twitch chat

Like Pokémon Community Game, but with Once Human's combat deviations. While a channel is live,
a deviation "breaches containment" in chat every ~10 minutes; viewers type `!secure` to throw a
Securement Unit. Collections, Starchrom and Units are global per Twitch user, so they follow a
viewer to every channel that runs the game.

Deviations, variations and skins are read live from
https://ohwikiguide.com/Deviation_Main_Page (`combatData`, `deviationVariations`, `deviationSkins`)
every 6 hours — add a deviation to the wiki and it joins the game. `combat-fallback.json` is the
snapshot used if the wiki is unreachable.

## Commands
Viewers: `!secure [standard|advanced|elite|anomaly]` (alias `!catch`), `!units`, `!shop`,
`!buy <unit> <n>`, `!daily`, `!dex [user]`, `!scrap`, `!traits [name]`, `!dev <name>`, `!hunttop`, `!hunt`.
Mods: `!hunt spawn`, `!hunt interval <min>`, `!hunt off|on`, `!hunt status`, `!hunt leave`.
In the bot's own channel: `!join`, `!leave`.

## Specimens & traits
Every secured deviation is its own specimen with Deviant Power 1-5 and Mood 1-5 and three
traits. Traits follow https://ohwikiguide.com/Deviation_Trait_Page exactly (read live, snapshot in
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
`/` add-to-Twitch page + guide · `/u/<login>` a viewer's Deviadex · `/top` leaderboard ·
`/dex` all deviations · `/setup?key=ADMIN_KEY` log in as the bot account · `/admin?key=ADMIN_KEY`.

## Deploy (Railway)
Own Twitch dev app (redirect `<BASE_URL>/auth/callback`), a volume at `/data`, env vars from
`.env.example`, then open `/setup?key=...` and log in as the bot's Twitch account.
Test locally with `npm test` (simulated chat).
