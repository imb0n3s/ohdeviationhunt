// scripts/wiki-page.js — builds the player guide for https://ohwikiguide.com/Deviation_Hunt
// straight from the game's own settings, so the numbers on the wiki always match the bot.
//
//   node scripts/wiki-page.js > docs/Deviation_Hunt.wiki
//
// Re-run and re-publish whenever rarity.js, config.js, traits.js or the commands change.
for (const k of ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "ADMIN_KEY", "SESSION_SECRET"]) process.env[k] ||= "wiki"; // config.js needs them; unused here
process.env.BASE_URL ||= "https://deviationhunt.ohwikiguide.com";
const path = require("path");
const cfg = require("../config");
const { TIERS, VARIANT, UNITS, ECONOMY, GLOVES, SOUP, rarityOf, isChaos } = require("../rarity");
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
<div style="color:#cfd6df; line-height:1.7;">A Once Human catching game that lives in Twitch chat. While a stream is live, deviations are spotted in the wild in chat — type ${cmd("!secure")} to catch them, collect all ${devs.length} deviations with their variations and skins, and roll the best Skill Rating, Activity Rating and traits. Your Securement Pods follows you to '''every''' channel that runs the game.</div>
<div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:10px;">
<span style="background:#0ea5e9; border-radius:8px; padding:6px 14px; font-weight:700;">[${URL} <span style="color:#04121c;">Add it to your channel</span>]</span>
<span style="background:#131c27; border:1px solid #1f2a35; border-radius:8px; padding:6px 14px; font-weight:700;">[${URL}/channels <span style="color:#e6edf3;">Where to play</span>]</span>
<span style="background:#131c27; border:1px solid #1f2a35; border-radius:8px; padding:6px 14px; font-weight:700;">[${URL}/top <span style="color:#e6edf3;">Leaderboard</span>]</span>
<span style="background:#131c27; border:1px solid #1f2a35; border-radius:8px; padding:6px 14px; font-weight:700;">[[Deviation_Main_Page|<span style="color:#e6edf3;">Deviation database</span>]]</span>
</div>
</div>
`);

out.push(box("Start", "How to Play", `
# Watch a stream that has '''${BOT}''' in chat — [${URL}/channels see every channel running it].
# When the bot posts ''"👀 A … has been spotted in the wild!"'', type ${cmd("!secure")} within '''${cfg.SPAWN_WINDOW_SECONDS} seconds'''. Each throw costs ${ECONOMY.throwCost} ${SC}; the bot replies with how many Securement Units you'll have left if you catch it. When time runs out the bot posts ''"⏱️ Time's up! … can no longer be captured."'' — throws after that are too late (nothing is spent).
# When the timer ends the bot posts who secured it, along with each new specimen's Skill and Activity Rating.
# Check your collection any time with ${cmd("!pods")} or on your own page: ${code(`<nowiki>${URL}/u/</nowiki>''yourname''`)}

Your first ${cmd("!secure")} signs you up automatically — you start with '''${ECONOMY.starterUnits.standard} Securement Units''' and '''${ECONOMY.starterStarchrom} ${SC}'''. Every ${cmd("!secure")} throw costs '''${ECONOMY.throwCost} ${SC}'''. A Securement Unit is only used to '''house''' a deviation you catch — if it breaks free, you keep the unit. You need at least one empty unit to throw, and you get one throw per spawn.
`));

out.push(box("Chat", "List of All Commands", table(["Command", "Effect"], [
  [cmd("!secure"), `Throw at the deviation that's loose in chat (${ECONOMY.throwCost} ${SC}; a catch goes into one of your Securement Units). Also works as ${cmd("!catch")}. One throw per person per spawn.`],
  [cmd("!donate <amount>"), `\'\'\'Legendary pool:\'\'\' while a Legendary (Variation or Skin) is loose, put up to ${ECONOMY.legendaryPoolMax} ${SC} into its pool (${cmd("!donate max")} for the most you can). If it reaches ${fmt(ECONOMY.legendaryPoolGoal)} ${SC} before time runs out, everyone who donated and throws ${cmd("!secure")} catches it \'\'\'100%\'\'\'. Until it fills, each donor adds '''+${+(ECONOMY.legendaryPoolPerDonor * 100).toFixed(2)}% catch chance''' for every donor who throws. Donations are '''not refunded''', even if it doesn't fill. ${cmd("!pool")} shows the total.`],
  [cmd("!units"), `Show your Securement Units, ${SC}, and when your next free unit arrives. Also ${cmd("!inv")}.`],
  [cmd("!starchrom"), `Shows how much ${SC} you have. Also works as ${cmd("!sc")}.`],
  [cmd("!shop"), `Show what the shop sells and the prices. The Securement Pods panel has the same shop in its '''Shop''' tab.`],
  [cmd("!buy <amount>"), `Buy Securement Units for ${fmt(unitPrice)} ${SC} each, e.g. ${cmd("!buy 2")}.`],
  [cmd("!daily"), `Claim your daily supply drop: +${ECONOMY.daily.starchrom} ${SC} and ${ECONOMY.daily.units.standard} Securement Unit, and turn on your hourly perks (${ECONOMY.hourlyUnits} free Securement Unit + ${ECONOMY.hourlyStarchrom} ${SC} every hour) for that stream. '''Once a day''' — resets at midnight Central time — and only during a live stream. The bot also tells you your check-in number (how many days you've claimed it, no limit).`],
  [cmd("!hourly"), `Turn on hourly perks for the stream you\'re in: ${ECONOMY.hourlyUnits} free Securement Unit + ${ECONOMY.hourlyStarchrom} ${SC} every hour while you\'re there. Your first ${cmd("!secure")} or ${cmd("!daily")} in that stream turns them on too. \'\'\'One stream at a time\'\'\' — in another channel they move over when you type ${cmd("!hourly")} or ${cmd("!secure")} there, and your timer keeps going; the next broadcast needs ${cmd("!hourly")} again. Typed again in the same stream, it shows when the next one arrives.`],
  [cmd("!timercheck"), `When your next free hourly Securement Unit (+${ECONOMY.hourlyStarchrom} ${SC}) arrives, or how to start/resume your timer. Also ${cmd("!timer")}.`],
  [cmd("!pods [name]"), `Your collection count (unique deviations, variations and skins, counted separately) and a link to your collection page. Add a name to see someone else's. Also ${cmd("!pod")}.`],
  [cmd("!traits <deviation>"), `Skill Rating, Activity Rating and all three traits of your top specimen of that deviation (best skin, else best variation, else best). Also ${cmd("!stats")}.`],
  [cmd("!dev <deviation>"), `Info about a deviation: what it does, its variations and skins, and a wiki link.`],
  [cmd("!hunttop"), `Top collectors across every channel. Also ${cmd("!leaderboard")}.`],
  [cmd("!todaysleader"), `Who has secured the most deviations in the current stream (top 5).`],
  [cmd("!hunt"), `Short help message with a link to this guide.`],
])));

out.push(box("Mods", "Streamer & Mod Commands", `
Only the broadcaster and moderators can use these.
${table(["Command", "Effect"], [
  [cmd("!hunt spawn"), "Spawn a random deviation right now."],
  [cmd("!hourlycheck"), "Lists everyone whose hourly timer is running in this channel right now, with minutes until their next free Securement Unit."],
  [cmd("!hunt interval <minutes>"), `How often deviations appear while you're live (2–120 minutes, default ${cfg.SPAWN_INTERVAL_MIN}).`],
  [cmd("!hunt off") + " / " + cmd("!hunt on"), "Pause or resume spawns. Other commands keep working."],
  [cmd("!hunt status"), "Live status, spawn timer, what's loose, and this channel's spawn/catch totals."],
  [cmd("!hunt obs"), "Posts your channel's OBS Source link (see Add Deviation Hunt to Your Channel)."],
  [cmd("!hunt chatdelay <seconds>"), `While your OBS Source is on stream, the bot waits this long (0–30, default ${cfg.RESULT_CHAT_DELAY_SECONDS}) before announcing a new deviation and before posting who secured it, so viewers see it on screen first. ${cmd("!hunt chatdelay 0")} posts right away.`],
  [cmd("!hunt spawnchat on / off"), "Turn off the chat message when a deviation appears, so it only shows on your OBS Source. Results (who secured it, or that it got away) always post in chat. Only applies while your OBS Source is open — without it, chat still announces spawns so the game keeps working."],
  [cmd("!hunt surprise on / off"), "Surprise mode: chat and your OBS Source show a variation or skin as the normal deviation until the result reveals it. Off by default — chat and the OBS Source name a variation or skin as soon as it appears."],
  [cmd("!hunt leave"), "Remove the bot from your channel."],
  [cmd("!hunt help"), "List the mod commands in chat."],
])}
`));

out.push(box("Shop", "Securement Units, Capture Soup & Gloves", `
Buy with ${cmd("!buy")} in chat, in the Securement Pods panel's '''Shop''' tab, or on your own collection page (signed in with Twitch). Buying gloves in the panel or on the website is announced in the chat of the live stream you're playing in.
${table(["Item", "Description", "Price"], [
  ["'''Securement Unit'''", "Houses one deviation you catch. Only used when a catch succeeds; you need an empty one to throw. " + cmd("!buy <amount>"), `${fmt(unitPrice)} ${SC}`],
  [`'''<span style="color:#fb923c;">Capture Soup</span>'''`, `+${SOUP.bonus * 100}% catch chance on every throw for '''1 hour''' after you buy it. Stacks with your gloves; each extra bowl adds another hour. ${cmd("!buy soup")}`, `${fmt(SOUP.price)} ${SC}`],
  ...GLOVES.map((g) => [`'''<span style="color:${g.color};">${g.name}</span>''' <small>(${g.rarity})</small>`, `+${Math.round(g.bonus * 100)}% catch chance on every throw. Lasts '''${g.catches} successful catches'''. ${cmd("!buy " + g.id)}`, `${fmt(g.price)} ${SC}`]),
])}
You have up to '''${ECONOMY.unitCap} Securement Pods''' — every deviation you've caught '''and''' every empty Securement Unit takes one. '''Free units''' (hourly and ${cmd("!daily")}) keep coming until you use '''${ECONOMY.freeUnitCap} Pods'''; after that you buy Securement Units with ${SC} (${cmd("!buy <amount>")}), up to ${ECONOMY.unitCap}. Free space by scrapping extra specimens on your collection page or in the Twitch panel.

'''Gloves wear out.''' Each successful catch made wearing them uses one up; when they run out they're gone and you buy a new pair (${GLOVES.map((g) => `${g.name} ${g.catches}`).join(", ")} — the same Starchrom per catch for every pair). Throws that miss don't count. '''You wear one pair of gloves at a time.''' Buying a better pair replaces the one you have — there's '''no refund''' for the old pair, and gloves can't be scrapped. You can't buy a pair weaker than (or the same as) the one you wear. The bonus is added to the catch chance (a ${pct(TIERS.legendary.catch)} Legendary becomes ${pct(TIERS.legendary.catch + GLOVES[GLOVES.length - 1].bonus)} with ${GLOVES[GLOVES.length - 1].name}), still capped at ${pct(ECONOMY.maxCatchChance)}.

'''Ways to get Securement Units'''
${table(["Source", "Amount"], [
  ["Starting supply", `${ECONOMY.starterUnits.standard} units`],
  ["Free hourly unit", `+${ECONOMY.hourlyUnits} unit every hour in the live stream where you turned on hourly perks with ${cmd("!hourly")}, your first ${cmd("!secure")} or ${cmd("!daily")}. \'\'\'One stream at a time\'\'\' — in another channel they move over as soon as you type ${cmd("!hourly")} or ${cmd("!secure")} there, and your timer keeps going (switching never restarts the hour). A new broadcast needs ${cmd("!hourly")} again. Each one comes with \'\'\'+${ECONOMY.hourlyStarchrom} ${SC}\'\'\' (you still get the ${SC} if your pods are full). The bot tells you in chat each time one arrives, along with how many Securement Units and ${SC} you now have. ${cmd("!timercheck")} shows when the next one arrives.`],
  [cmd("!daily"), `+${ECONOMY.daily.units.standard} unit, once a day (resets at midnight Central)`],
  ["Scrapping an extra specimen (Twitch panel or your collection page)", `+${ECONOMY.destroyUnits} unit (plus ${fmt(ECONOMY.destroyValue)} ${SC})`],
  [cmd("!buy <amount>") + " or the panel's '''Shop''' tab", `${fmt(unitPrice)} ${SC} each`],
])}
`));

out.push(box("Currency", SC, `
${SC} is earned by securing deviations and spent on throws (${ECONOMY.throwCost} per ${cmd("!secure")}) and Securement Units.
${table(["How", SC], [
  ["Securing a deviation", Object.entries(TIERS).map(([k, t]) => `${tierTag(k)} ${t.reward}`).join(" · ")],
  ["Securing a Variation (always Legendary)", `${TIERS[VARIANT.variation.rarity].reward * VARIANT.variation.rewardMult}`],
  ["Securing a Skin (always Legendary)", `${skinReward}`],
  ["First time you secure a deviation (or a new variant of it)", `+${ECONOMY.newSpeciesBonus} bonus`],
  [cmd("!daily"), `+${ECONOMY.daily.starchrom}`],
  ["Every hour in the stream where you used !hourly / !secure / !daily", `+${ECONOMY.hourlyStarchrom} (with your free Securement Unit)`],
  ["Scrapping an extra specimen (Twitch panel or your collection page)", `+${fmt(ECONOMY.destroyValue)} each, plus ${ECONOMY.destroyUnits} Securement Unit back (only while you own more than one)`],
])}
`));

const rarityRows = Object.entries(TIERS).map(([k, t]) => [
  tierTag(k), pct(t.weight / totalWeight), pct(t.catch), `${t.reward}`, `${(byTier[k] || []).length}`,
]);
out.push(box("Odds", "Spawn Rates & Capture Rates", `
Each spawn first rolls a rarity, then a deviation of that rarity. Everyone who throws gets their own roll — any number of people can secure the same deviation.
${table(["Rarity", "Spawn chance", "Capture rate", `${SC} reward`, "Deviations"], rarityRows)}

* '''Every Variation and Skin is ${tierTag("legendary")}''', no matter the rarity of the deviation it belongs to — a Common deviation's variations and skins are Legendary too.
* '''Variations and skins are announced as they appear.''' Chat and the streamer's OBS Source name the variation or skin right away — unless the streamer turned on surprise mode (!hunt surprise on); then both show the normal deviation and the result reveals it.
* '''Variations''' are about ${pct(VARIANT.variation.chance)} of spawns (on deviations that have them), with a flat '''${pct(VARIANT.variation.catch)}''' capture rate and ${TIERS[VARIANT.variation.rarity].reward * VARIANT.variation.rewardMult} ${SC}.
* '''Skins''' are about ${pct(VARIANT.skin.chance)} of spawns (on deviations that have them), with a flat '''${pct(VARIANT.skin.catch)}''' capture rate and ${skinReward} ${SC}.
* '''Chaos variation''' — the rarest in the game. ${devs.filter((d) => d.variants.some(isChaos)).map((d) => d.name).join(", ")} can secretly be their ''Chaos'' variation in '''1 in ${Math.round(1 / VARIANT.chaos.chance)}''' of all spawns, with a flat '''${+(VARIANT.chaos.catch * 100).toFixed(1)}%''' capture rate (Legendary, ${TIERS[VARIANT.chaos.rarity].reward * VARIANT.chaos.rewardMult} ${SC}).
* Capture rates never go above ${pct(ECONOMY.maxCatchChance)}.
`));

out.push(box("Deviations", `All ${devs.length} Deviations by Rarity`, `
Every deviation from the [[Deviation_Main_Page|Deviation database]] can spawn: ${cats.map(([c, n]) => `${n} ${c}`).join(", ")}. Together they have ${nVar} variations and ${nSkin} skins to collect.
${Object.keys(TIERS).filter((k) => byTier[k]).map((k) => `\n<div style="margin-top:12px;">${tierTag(k)} <span style="color:#6b7a8c;">— ${byTier[k].length} deviations · ${pct(TIERS[k].catch)} capture</span></div>\n${chips(byTier[k])}`).join("\n")}
`));

out.push(box("Shiny", "Variations & Skins", `
Variations and skins are Deviation Hunt's shinies. Chat and the streamer's OBS Source name them as soon as they appear — unless the streamer turned on surprise mode (!hunt surprise on), where they look like the normal deviation until the result reveals what it really was:
${code(`🌟🌟🌟🌟🌟 LEGENDARY SECURED! 🌟🌟🌟🌟🌟 Grumpy Bulb — it was a ✨ Variation: Violet Robe (Legendary)! — a 3/4 by @metabones! 🔒 +${TIERS.legendary.reward} ${SC} each.`)}

* Each variation and skin is its own entry in your Securement Pods, and the first one of each earns the +${ECONOMY.newSpeciesBonus} new-entry bonus.
* Your collection page and the Twitch panel count '''Variations''' and '''Skins''' separately (their own totals and their own lists on each deviation). Caught variations glow '''<span style="color:#fbbf24;">gold</span>''' and caught skins glow '''<span style="color:#f472b6;">pink</span>''', showing the variant's picture.
* Some deviations have a trait that belongs to one variant only (e.g. Grumpy Bulb's Slot 1 trait is ''Violet Robe'') — see Traits below.
`));

out.push(box("Ratings", "Skill Rating & Activity Rating", `
Every deviation you secure is its own specimen with two ratings from 1 to 5 — '''Skill Rating''' (Deviant Power) and '''Activity Rating''' (Mood). Higher is rarer:
${table(["Rating", "1", "2", "3", "4", "5"], [["Chance", ...RATING_WEIGHTS.map((w) => pct(w / ratingTotal))]])}

A 5/5 specimen gets a ⭐ in chat. Catch the same deviation again to hunt for better ratings, then scrap the ones you don't want in the Twitch panel or on your collection page (signed in with Twitch).
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

out.push(box("Collection", "Securement Pods & Twitch Panel", `
Your collection is tied to your Twitch account, not to a channel — everything you catch on any stream lands in the same Securement Pods, and a name change doesn't lose it.

* '''Collection page:''' ${code(`<nowiki>${URL}/u/</nowiki>''yourname''`)} — every deviation grouped by Combat / Crafting / Territory, your top specimen's ratings and traits (your best skin, else best variation, else best overall — the one pictured), and caught variations and skins highlighted. On anyone's page, '''View all''' on a card with more than one shows every specimen they own of it with its ratings and traits. ${cmd("!pods")} posts your link. On the site, '''My Securement Pods''' in the top menu takes you straight to yours. Click '''Sign in with Twitch''' on your own page to use the '''Shop''' there too — buy Securement Units and Gloves with your Starchrom (signing in only confirms who you are).
* '''Twitch panel:''' the ''Securement Pods'' panel extension shows your own collection under the stream on any channel that installs it. Click '''Show my Securement Pods''' once to let Twitch share your username with it. Under your name, a countdown shows how long until your next free hourly Securement Unit (or reminds you to type ${cmd("!daily")} or ${cmd("!hourly")} first), plus a link to your own collection page. Click a deviation to see '''every''' specimen you own with its Skill Rating, Activity Rating and traits — when you have more than one, you can '''scrap''' the one you pick for '''${fmt(ECONOMY.destroyValue)} ${SC} + ${ECONOMY.destroyUnits} Securement Unit''' (you always keep at least one). The '''Commands''' tab lists every chat command. Switch to the '''Shop''' tab to buy Securement Units with your Starchrom without typing in chat. ''The panel is in testing and will be installable by every streamer once Twitch approves it.''
* '''Leaderboard:''' [${URL}/top ${URL.replace(/^https?:\/\//, "")}/top] or ${cmd("!hunttop")}.
`));

out.push(box("Scrap", "How to Scrap Extra Deviations", `
Caught the same deviation more than once? Keep the best one and scrap the rest. Each scrap gives you '''${fmt(ECONOMY.destroyValue)} ${SC} + ${ECONOMY.destroyUnits} Securement Unit''' and frees up a Securement Pod. You always keep at least one of every deviation (you can't scrap your last one). Variations and skins can be scrapped too, but only if you pick them. There is no chat command for scrapping — ${cmd("!scrap")} just tells you where to go.

'''On the website'''
# Go to [${URL}/me ${URL.replace(/^https?:\/\//, "")}/me] (''My Securement Pods'') and click '''Sign in with Twitch'''. The Scrap buttons only appear on your own page while you're signed in.
# Find the deviation you have extras of (the '''×2''', '''×3'''… in the corner of its card).
# Click the red '''Scrap extras''' button at the bottom of that card — clicking the picture itself does nothing.
# Every copy you own is listed with its Skill/Activity Rating, variation or skin, and traits. Your best one is marked '''Best''' (a skin beats a variation, a variation beats a normal one, then a Legendary trait such as Upper Hand, then the higher rating, then more traits).
# Click '''Scrap''' on the one you don't want and confirm.

'''In the Twitch panel'''
# Under the stream, open the ''Securement Pods'' panel and click '''Show my Securement Pods''' (first time only).
# Click the deviation you have extras of.
# Every copy you own is listed with its ratings and traits.
# Click '''Scrap for ${fmt(ECONOMY.destroyValue)} ${SC} + ${ECONOMY.destroyUnits} Securement Unit''' on the one you don't want, then '''Scrap''' to confirm.
`));

out.push(box("Streamers", "Add Deviation Hunt to Your Channel", `
# Go to [${URL} ${URL.replace(/^https?:\/\//, "")}] and click '''Add to my channel''' (sign in with Twitch). Or type ${cmd("!join")} in [https://www.twitch.tv/${BOT} ${BOT}'s chat].
# If the bot says it needs permission, type ${cmd(`/mod ${BOT}`)} in your chat and try again.
# That's it. Deviations appear about every '''${cfg.SPAWN_INTERVAL_MIN} minutes''' while you're '''live''' and someone has chatted in the last ${cfg.ACTIVITY_WINDOW_MIN} minutes. Change the timer with ${cmd("!hunt interval <minutes>")}.

'''OBS Source (optional):''' type ${cmd("!hunt obs")} in your chat to get your channel's link, then in OBS add a '''Browser''' source with it (600 × 600). It shows the deviation with a countdown while it can be caught, then for 12 seconds who secured it (with their Skill/Activity ratings, gold for Legendary catches). If nobody catches it, it just disappears. While a deviation can be caught it shows its picture, name and a countdown; it disappears when the deviation is secured or gets away. Add ${code("?demo=1")} to the link while positioning it.

'''Progress bar:''' add ${code("/bar")} to the end of the link (e.g. ${code("…/obs-source/yourcode/bar")}, Browser source 600 × 50) for a simple see-through bar that fills up as the next deviation gets closer and turns gold while one is loose. The normal link (no options) shows only the deviation, with no countdown to the next one.

'''Countdown version:''' add ${code("?countdown=1")} to the link and, between spawns, the OBS Source shows a ring counting down to the next deviation (or "Zzz — say hi in chat" when chat has been quiet), then the deviation, who caught it, and back to the countdown. Without it, the OBS Source stays hidden until a deviation appears.

'''Spawn alert:''' when a deviation appears the OBS Source plays a scanner ping and a voice: ''"A Deviation has been located."'' Variations and skins get a golden sparkle and ''"A Legendary Deviation has been located."'' (with surprise mode on, every spawn gets the normal alert). Tick '''Control audio via OBS''' on the Browser source: the alert then goes to the '''stream only''' (viewers hear it, the streamer doesn't) and gets its own volume slider in the Audio Mixer. Link options: ${code("?volume=40")} (0–100, default 100) or ${code("?sound=0")} for no sound; ${code("?demo=base")} / ${code("?demo=variation")} play the normal / Legendary alert for testing.
'''Shop overlay (break scene):''' add a second Browser source with ${code("<nowiki>"+URL+"/obs-shop</nowiki>")} (800×450) to show the Shop, every item's price and ${cmd("!buy")} command, the total Starchrom spent and the latest purchase. Same link for every channel; ${code("?bg=1")} adds a dark background.

To remove it, type ${cmd("!hunt leave")} in your chat or ${cmd("!leave")} in ${BOT}'s chat.
`));

const faq = [
  ["How do I start?", `Just type ${cmd("!secure")} the next time a deviation shows up. Your first throw signs you up with ${ECONOMY.starterUnits.standard} Securement Units and ${ECONOMY.starterStarchrom} ${SC}.`],
  ["I typed !secure and the bot didn't answer.", `That's normal — the bot stays quiet so chat isn't spammed. Results for everyone are posted when the ${cfg.SPAWN_WINDOW_SECONDS}-second window ends. It only replies right away if you're out of units.`],
  ["Why wasn't my name in the result?", `The result names who secured it and who it broke free from. If it broke free from you, you only spent the ${ECONOMY.throwCost} ${SC} throw — your Securement Unit stays empty and ready.`],
  ["I'm out of Securement Units.", `Claim ${cmd("!daily")} during a live stream: you get 1 right away, and 1 free every hour in that stream (${cmd("!hourly")} or your first ${cmd("!secure")} turns that on too). Or ${cmd("!buy <amount>")} for ${fmt(unitPrice)} ${SC} each. ${cmd("!units")} shows when the next free one arrives.`],
  ["Do better units exist?", `No — there's a single Securement Unit. Your odds depend only on the deviation's rarity and whether it's a variation or skin.`],
  ["Does my collection carry over between channels?", "Yes. It's tied to your Twitch account and shared across every channel running Deviation Hunt."],
  ["Why aren't deviations spawning?", `They only appear while the stream is live and chat has been active in the last ${cfg.ACTIVITY_WINDOW_MIN} minutes. A mod may also have used ${cmd("!hunt off")} — ${cmd("!hunt status")} shows what's going on.`],
  ["Where do the deviations, traits and pictures come from?", "Straight from this wiki — the [[Deviation_Main_Page|Deviation database]] and [[Deviation_Trait_Page|Deviation Trait Page]]. When the wiki is updated, the game picks it up within a few hours."],
];
out.push(box("FAQ", "Frequently Asked Questions", faq.map(([q, a]) => `'''Q: ${q}'''<br>A: ${a}`).join("\n\n")));

out.push(`</div>
__NOTOC__`);

process.stdout.write(out.join("\n"));
