// scripts/wiki-page.js — builds the player guide for https://ohwikiguide.com/Deviation_Hunt
// straight from the game's own settings, so the numbers on the wiki always match the bot.
//
//   node scripts/wiki-page.js > docs/Deviation_Hunt.wiki
//
// Re-run and re-publish whenever rarity.js, config.js, traits.js or the commands change.
for (const k of ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "ADMIN_KEY", "SESSION_SECRET"]) process.env[k] ||= "wiki"; // config.js needs them; unused here
process.env.BASE_URL ||= "https://ohdeviationhunt-production.up.railway.app";
const path = require("path");
const cfg = require("../config");
const { TIERS, VARIANT, UNITS, ECONOMY, rarityOf } = require("../rarity");
const { RATING_WEIGHTS, SLOT_CHANCE } = require("../traits");
const devs = require(path.join(__dirname, "..", "combat-fallback.json"));

const URL = cfg.BASE_URL;
const BOT = "ohdeviationhunt";
const SC = "Starchrom";
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const fmt = (n) => Number(n).toLocaleString("en-US");
const file = (img) => decodeURIComponent(String(img).split("/").pop());

// ---------- building blocks in the wiki's own style ----------
const box = (tag, title, body, right = "") => `
<div class="pn-box" style="background:#0d1319; border:1px solid #1f2a35; border-radius:14px; overflow:hidden; margin-bottom:14px;">
<div style="display:flex; align-items:center; gap:14px; padding:16px 18px;">
<span style="color:#0ea5e9; font-weight:800;">${tag}</span>
<span style="font-weight:700; color:#e6edf3; font-size:16px; flex:1;">${title}</span>${right ? `\n<span style="color:#6b7a8c; font-size:13px;">${right}</span>` : ""}
</div>
<div style="padding:14px 20px 18px; border-top:1px solid #1f2a35; color:#cfd6df; line-height:1.7;">
${body.trim()}
</div>
</div>
`;

const TH = 'style="background:#131c27; color:#e6edf3; text-align:left;"';
function table(headers, rows) {
  return `{| class="wikitable" style="width:100%; background:#0f1620; color:#cfd6df; border:1px solid #1f2a35; margin-top:10px;"
${headers.map((h) => `! ${TH} | ${h}`).join("\n")}
${rows.map((r) => `|-\n| ${r.join(" || ")}`).join("\n")}
|}`;
}
const CODE = 'style="background:#131c27; color:#7dd3fc; border:1px solid #1f2a35; border-radius:6px; padding:1px 6px; font-family:monospace; font-size:13px;"';
const cmd = (c) => `<span ${CODE}><nowiki>${c}</nowiki></span>`;
const code = (c) => `<span ${CODE}>${c}</span>`;
const hl = (t) => `<span style="color:#0ea5e9; font-weight:800;">${t}</span>`;
const tierTag = (t) => `<span style="color:${TIERS[t].color}; font-weight:800;">${TIERS[t].label}</span>`;

// ---------- numbers ----------
const totalWeight = Object.values(TIERS).reduce((s, t) => s + t.weight, 0);
const byTier = {};
for (const d of devs) (byTier[rarityOf(d.name)] ||= []).push(d);
const nVar = devs.reduce((s, d) => s + d.variants.filter((v) => v.kind === "variation").length, 0);
const nSkin = devs.reduce((s, d) => s + d.variants.filter((v) => v.kind === "skin").length, 0);
const cats = ["combat", "crafting", "territory"].map((c) => [c, devs.filter((d) => d.category === c).length]);
const ratingTotal = RATING_WEIGHTS.reduce((a, b) => a + b, 0);
const unitPrice = UNITS.standard.price;
const skinReward = TIERS[VARIANT.skin.rarity].reward * VARIANT.skin.rewardMult;

const chips = (list) => `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">${list
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((d) => `<span style="display:inline-flex; align-items:center; gap:6px; background:#131c27; border:1px solid #1f2a35; border-radius:8px; padding:2px 8px 2px 2px; font-size:13px;">[[File:${file(d.img)}|28px|link=]] ${d.name}</span>`)
  .join("")}</div>`;

// ---------- page ----------
const out = [];
out.push(`<div style="max-width:1000px; margin:0 auto;">
<div style="background:linear-gradient(135deg,#0d1319,#10202e); border:1px solid #1f2a35; border-radius:16px; padding:22px 24px; margin-bottom:16px;">
<div style="color:#0ea5e9; font-weight:800; font-size:13px; letter-spacing:1px; text-transform:uppercase;">Twitch Chat Game</div>
<div style="color:#e6edf3; font-size:28px; font-weight:800; margin:4px 0 6px;">Deviation Hunt</div>
<div style="color:#cfd6df; line-height:1.7;">A Once Human catching game that lives in Twitch chat. While a stream is live, deviations are spotted in the wild in chat — type ${cmd("!secure")} to catch them, collect all ${devs.length} deviations with their variations and skins, and roll the best Skill Rating, Activity Rating and traits. Your Deviation Bag follows you to '''every''' channel that runs the game.</div>
<div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:10px;">
<span style="background:#0ea5e9; border-radius:8px; padding:6px 14px; font-weight:700;">[${URL} <span style="color:#04121c;">Add it to your channel</span>]</span>
<span style="background:#131c27; border:1px solid #1f2a35; border-radius:8px; padding:6px 14px; font-weight:700;">[${URL}/top <span style="color:#e6edf3;">Leaderboard</span>]</span>
<span style="background:#131c27; border:1px solid #1f2a35; border-radius:8px; padding:6px 14px; font-weight:700;">[[Deviation_Main_Page|<span style="color:#e6edf3;">Deviation database</span>]]</span>
</div>
</div>
`);

out.push(box("Start", "How to Play", `
# Watch a stream that has '''${BOT}''' in chat.
# When the bot posts ''"👀 A … has been spotted in the wild!"'', type ${cmd("!secure")} within '''${cfg.SPAWN_WINDOW_SECONDS} seconds'''.
# When the timer ends the bot posts who secured it, along with each new specimen's Skill and Activity Rating.
# Check your collection any time with ${cmd("!deviationbag")} or on your own page: ${code(`<nowiki>${URL}/u/</nowiki>''yourname''`)}

Your first ${cmd("!secure")} signs you up automatically — you start with '''${ECONOMY.starterUnits.standard} Securement Units''' and '''${ECONOMY.starterStarchrom} ${SC}'''. Every ${cmd("!secure")} uses one Securement Unit whether it catches or not, and you get one throw per spawn.
`));

out.push(box("Chat", "List of All Commands", table(["Command", "Effect"], [
  [cmd("!secure"), `Throw a Securement Unit at the deviation that's loose in chat. Also works as ${cmd("!catch")}. One throw per person per spawn.`],
  [cmd("!units"), `Show your Securement Units, ${SC}, and when your next free unit arrives. Also ${cmd("!inv")}.`],
  [cmd("!shop"), `Show what the shop sells and the prices. The Deviation Bag panel has the same shop in its '''Shop''' tab.`],
  [cmd("!buy <amount>"), `Buy Securement Units for ${fmt(unitPrice)} ${SC} each, e.g. ${cmd("!buy 2")}.`],
  [cmd("!daily"), `Claim your daily supply drop: +${ECONOMY.daily.starchrom} ${SC} and ${ECONOMY.daily.units.standard} Securement Unit, and turn on ${ECONOMY.hourlyUnits} free Securement Unit every hour for the rest of that live stream. '''Once per stream''' — you can claim it again in every new stream you watch.`],
  [cmd("!deviationbag [name]"), `Your collection count (unique deviations, variants & skins) and a link to your collection page. Add a name to see someone else's.`],
  [cmd("!traits <deviation>"), `Skill Rating, Activity Rating and all three traits of your best specimen of that deviation. Also ${cmd("!stats")}.`],
  [cmd("!dev <deviation>"), `Info about a deviation: what it does, its variations and skins, and a wiki link.`],
  [cmd("!scrap"), `Recycle every duplicate for ${SC} (${pct(ECONOMY.scrapValue)} of its catch reward). You keep the specimen with the best Skill + Activity Rating of each deviation and variant.`],
  [cmd("!hunttop"), `Top collectors across every channel. Also ${cmd("!leaderboard")}.`],
  [cmd("!hunt"), `Short help message with a link to this guide.`],
])));

out.push(box("Mods", "Streamer & Moderator Commands", `
Only the broadcaster and moderators can use these.
${table(["Command", "Effect"], [
  [cmd("!hunt spawn"), "Spawn a deviation right now."],
  [cmd("!hunt interval <minutes>"), `How often deviations appear while you're live (2–120 minutes, default ${cfg.SPAWN_INTERVAL_MIN}).`],
  [cmd("!hunt off") + " / " + cmd("!hunt on"), "Pause or resume spawns. Other commands keep working."],
  [cmd("!hunt status"), "Live status, spawn timer, what's loose, and this channel's spawn/catch totals."],
  [cmd("!hunt leave"), "Remove the bot from your channel."],
  [cmd("!hunt help"), "List the mod commands in chat."],
])}
`));

out.push(box("Shop", "Securement Units", `
Securement Units are the only thing you need to catch deviations — there is one kind, and it works on everything.
${table(["Item", "Description", "Price"], [
  ["'''Securement Unit'''", "Catches one deviation. Used up on every " + cmd("!secure") + ", caught or not.", `${fmt(unitPrice)} ${SC}`],
])}

'''Ways to get Securement Units'''
${table(["Source", "Amount"], [
  ["Starting supply", `${ECONOMY.starterUnits.standard} units`],
  ["Free hourly unit", `+${ECONOMY.hourlyUnits} unit every hour — '''only after you claim ${cmd("!daily")} during a live stream''', and only while that same stream stays live. The bot tells you in chat each time one arrives. Hourly units only run in '''one stream at a time''': claiming ${cmd("!daily")} in another stream moves them there.`],
  [cmd("!daily"), `+${ECONOMY.daily.units.standard} unit, once per live stream`],
  ["Destroying an extra specimen in the Twitch panel", `+${ECONOMY.destroyUnits} unit (plus ${fmt(ECONOMY.destroyValue)} ${SC})`],
  [cmd("!buy <amount>") + " or the panel's '''Shop''' tab", `${fmt(unitPrice)} ${SC} each`],
])}
`));

out.push(box("Currency", SC, `
${SC} is earned by securing deviations and spent on Securement Units.
${table(["How", SC], [
  ["Securing a deviation", Object.entries(TIERS).map(([k, t]) => `${tierTag(k)} ${t.reward}`).join(" · ")],
  ["Securing a Variation", `×${VARIANT.variation.rewardMult} the normal reward`],
  ["Securing a Skin", `${skinReward}`],
  ["First time you secure a deviation (or a new variant of it)", `+${ECONOMY.newSpeciesBonus} bonus`],
  ["A throw that misses", `+${ECONOMY.escapeSalvage} salvage`],
  [cmd("!daily"), `+${ECONOMY.daily.starchrom}`],
  [cmd("!scrap"), `${pct(ECONOMY.scrapValue)} of the catch reward per duplicate`],
  ["Destroying an extra specimen in the Twitch panel", `+${fmt(ECONOMY.destroyValue)} each, plus ${ECONOMY.destroyUnits} Securement Unit back (only while you own more than one)`],
])}
`));

const rarityRows = Object.entries(TIERS).map(([k, t]) => [
  tierTag(k), pct(t.weight / totalWeight), pct(t.catch), pct(t.catch * VARIANT.variation.catchMult), `${t.reward}`, `${(byTier[k] || []).length}`,
]);
out.push(box("Odds", "Spawn Rates & Capture Rates", `
Each spawn first rolls a rarity, then a deviation of that rarity. Everyone who throws gets their own roll — any number of people can secure the same deviation.
${table(["Rarity", "Spawn chance", "Capture rate", "Capture rate (Variation)", `${SC} reward`, "Deviations"], rarityRows)}

* '''Variations''' spawn about ${pct(VARIANT.variation.chance)} of the time (on deviations that have them). They are ${pct(1 - VARIANT.variation.catchMult)} harder to secure and pay ×${VARIANT.variation.rewardMult} ${SC}.
* '''Skins''' spawn about ${pct(VARIANT.skin.chance)} of the time (on deviations that have them). Every skin counts as ${tierTag("legendary")} with a flat '''${pct(VARIANT.skin.catch)}''' capture rate.
* Capture rates never go above ${pct(ECONOMY.maxCatchChance)}.
`));

out.push(box("Deviations", `All ${devs.length} Deviations by Rarity`, `
Every deviation from the [[Deviation_Main_Page|Deviation database]] can spawn: ${cats.map(([c, n]) => `${n} ${c}`).join(", ")}. Together they have ${nVar} variations and ${nSkin} skins to collect.
${Object.keys(TIERS).filter((k) => byTier[k]).map((k) => `\n<div style="margin-top:12px;">${tierTag(k)} <span style="color:#6b7a8c;">— ${byTier[k].length} deviations · ${pct(TIERS[k].catch)} capture</span></div>\n${chips(byTier[k])}`).join("\n")}
`));

out.push(box("Shiny", "Variations & Skins", `
Variations and skins are Deviation Hunt's shinies. When one appears, the spawn message says so:
${code(`👀 A Grumpy Bulb has been spotted in the wild! ✨ VARIATION: Violet Robe Type !secure within ${cfg.SPAWN_WINDOW_SECONDS}s to catch it.`)}

* Each variation and skin is its own entry in your Deviation Bag, and the first one of each earns the +${ECONOMY.newSpeciesBonus} new-entry bonus.
* On your collection page and in the Twitch panel, caught variations glow '''<span style="color:#fbbf24;">gold</span>''' and caught skins glow '''<span style="color:#f472b6;">pink</span>''', showing the variant's picture.
* Some deviations have a trait that belongs to one variant only (e.g. Grumpy Bulb's Slot 1 trait is ''Violet Robe'') — see Traits below.
`));

out.push(box("Ratings", "Skill Rating & Activity Rating", `
Every deviation you secure is its own specimen with two ratings from 1 to 5 — '''Skill Rating''' (Deviant Power) and '''Activity Rating''' (Mood). Higher is rarer:
${table(["Rating", "1", "2", "3", "4", "5"], [["Chance", ...RATING_WEIGHTS.map((w) => pct(w / ratingTotal))]])}

A 5/5 specimen gets a ⭐ in chat. Catch the same deviation again to hunt for better ratings — ${cmd("!scrap")} always keeps your best one.
`));

out.push(box("Traits", "Traits", `
Each specimen has three trait slots, and '''each slot may or may not have a trait''' — so a specimen can have none, one, two or all three. Filled slots follow the exact rules of the [[Deviation_Trait_Page|Deviation Trait Page]], for the deviation's own category (combat, crafting or territory):
${table(["Slot", "Chance of a trait", "What it can roll"], [
  ["'''Slot 1'''", pct(SLOT_CHANCE[1]), `Any Global trait (with a random level), or — sometimes — that deviation's own Slot 1 trait.`],
  ["'''Slot 2'''", pct(SLOT_CHANCE[2]), `Any general Slot 2 trait of its category, or — sometimes — one of that deviation's own Slot 2 traits. Another deviation's own trait can never appear.`],
  ["'''Slot 3'''", pct(SLOT_CHANCE[3]), `Any Slot 3 (fused) trait of its category.`],
])}

* A deviation's own traits that belong to a specific variation or skin only ever appear on that variant — and that variant always carries it, so its slot is never empty.
* Own traits that aren't tied to a variant can appear on any specimen of that deviation.
* See any specimen's traits with ${cmd("!traits <deviation>")}, on your collection page, or in the Twitch panel.
`));

out.push(box("Collection", "Deviation Bag & Twitch Panel", `
Your collection is tied to your Twitch account, not to a channel — everything you catch on any stream lands in the same Deviation Bag, and a name change doesn't lose it.

* '''Collection page:''' ${code(`<nowiki>${URL}/u/</nowiki>''yourname''`)} — every deviation grouped by Combat / Crafting / Territory, your best specimen's ratings and traits, and caught variations and skins highlighted. ${cmd("!deviationbag")} posts your link.
* '''Twitch panel:''' the ''Deviation Bag'' panel extension shows your own collection under the stream on any channel that installs it. Click '''Show my Deviation Bag''' once to let Twitch share your username with it. Click a deviation to see '''every''' specimen you own with its Skill Rating, Activity Rating and traits — when you have more than one, you can destroy an extra for '''${fmt(ECONOMY.destroyValue)} ${SC} + ${ECONOMY.destroyUnits} Securement Unit''' (you always keep at least one). Switch to the '''Shop''' tab to buy Securement Units with your Starchrom without typing in chat. ''The panel is in testing and will be installable by every streamer once Twitch approves it.''
* '''Leaderboard:''' [${URL}/top ${URL.replace(/^https?:\/\//, "")}/top] or ${cmd("!hunttop")}.
`));

out.push(box("Streamers", "Add Deviation Hunt to Your Channel", `
# Go to [${URL} ${URL.replace(/^https?:\/\//, "")}] and click '''Add to my channel''' (sign in with Twitch). Or type ${cmd("!join")} in [https://www.twitch.tv/${BOT} ${BOT}'s chat].
# If the bot says it needs permission, type ${cmd(`/mod ${BOT}`)} in your chat and try again.
# That's it. Deviations appear about every '''${cfg.SPAWN_INTERVAL_MIN} minutes''' while you're '''live''' and someone has chatted in the last ${cfg.ACTIVITY_WINDOW_MIN} minutes. Change the timer with ${cmd("!hunt interval <minutes>")}.

To remove it, type ${cmd("!hunt leave")} in your chat or ${cmd("!leave")} in ${BOT}'s chat.
`));

const faq = [
  ["How do I start?", `Just type ${cmd("!secure")} the next time a deviation shows up. Your first throw signs you up with ${ECONOMY.starterUnits.standard} Securement Units and ${ECONOMY.starterStarchrom} ${SC}.`],
  ["I typed !secure and the bot didn't answer.", `That's normal — the bot stays quiet so chat isn't spammed. Results for everyone are posted when the ${cfg.SPAWN_WINDOW_SECONDS}-second window ends. It only replies right away if you're out of units.`],
  ["Why wasn't my name in the result?", `Only the people who secured it are listed. If your name isn't there, it broke free from your unit (you still get +${ECONOMY.escapeSalvage} ${SC}).`],
  ["I'm out of Securement Units.", `Claim ${cmd("!daily")} during a live stream: you get 1 right away and 1 free every hour for the rest of that stream. Or ${cmd("!buy <amount>")} for ${fmt(unitPrice)} ${SC} each. ${cmd("!units")} shows when the next free one arrives.`],
  ["Do better units exist?", `No — there's a single Securement Unit. Your odds depend only on the deviation's rarity and whether it's a variation or skin.`],
  ["Does my collection carry over between channels?", "Yes. It's tied to your Twitch account and shared across every channel running Deviation Hunt."],
  ["Why aren't deviations spawning?", `They only appear while the stream is live and chat has been active in the last ${cfg.ACTIVITY_WINDOW_MIN} minutes. A mod may also have used ${cmd("!hunt off")} — ${cmd("!hunt status")} shows what's going on.`],
  ["Where do the deviations, traits and pictures come from?", "Straight from this wiki — the [[Deviation_Main_Page|Deviation database]] and [[Deviation_Trait_Page|Deviation Trait Page]]. When the wiki is updated, the game picks it up within a few hours."],
];
out.push(box("FAQ", "Frequently Asked Questions", faq.map(([q, a]) => `'''Q: ${q}'''<br>A: ${a}`).join("\n\n")));

out.push(`</div>
__NOTOC__`);

process.stdout.write(out.join("\n"));
