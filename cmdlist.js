// cmdlist.js — the one list of chat commands, shown on the website's Commands page and in the
// Twitch panel's Commands tab. Text is plain; `backticks` mark a command (rendered as <kbd>).
const cfg = require("./config");
const shop = require("./shop");
const { ECONOMY: E, UNITS } = require("./rarity");

const fmt = (n) => Number(n).toLocaleString("en-US");

function commandSections() {
  const gloves = shop.ITEMS.filter((i) => i.kind === "gloves").map((i) => `${i.name} +${Math.round(i.bonus * 100)}% (${fmt(i.price)})`).join(" · ");
  return [
    { id: "viewer", title: "Viewer Commands", rows: [
      ["!daily", `Start here. Once a day (resets at midnight Central) while the stream is live: +${E.daily.starchrom} Starchrom and ${E.daily.units.standard} Securement Unit, and it turns on your hourly perks (see \`!hourly\`). Also shows your check-in count (how many days you've claimed it).`],
      ["!hourly", `Turns on today's hourly perks: ${E.hourlyUnits} free Securement Unit + ${E.hourlyStarchrom} Starchrom every hour you're in a live stream, until midnight Central. Your first \`!secure\` or \`!daily\` of the day turns them on too — type \`!hourly\` when you get into a channel to start the clock right away, or to see when the next one arrives.`],
      ["!secure", `Throw at the deviation that's spotted in the wild (you have ${cfg.SPAWN_WINDOW_SECONDS} seconds; chat says "⏱️ Time's up!" when it can no longer be captured). Costs ${E.throwCost} Starchrom and needs an empty Securement Unit; if you catch it, it lives in that unit. One throw per spawn. Also \`!catch\`.`],
      ["!pods", "Your Securement Pods: how many deviations, variations and skins you've secured (each counted separately), plus a link to your collection page. Add a name (`!pods luna_raventhorn`) to see someone else's. Also `!pod`."],
      ["!starchrom", "How much Starchrom you have. Also `!sc`."],
      ["!units", "Your Starchrom, Securement Units and when your next free hourly unit arrives. Also `!inv`."],
      ["!shop", `What the shop sells: Securement Units (${fmt(UNITS.standard.price)} Starchrom each) and Gloves — ${gloves}.`],
      ["!buy <amount>", `Buy Securement Units, e.g. \`!buy 3\`. Buy gloves with \`!buy rustic\`, \`!buy bbq\` or \`!buy savior\`. You can hold ${E.unitCap} Securement Pods in total (caught deviations + empty units).`],
      ["!traits [deviation]", "Skill Rating, Activity Rating and traits of your latest catch, or of a deviation you've secured (`!traits grumpy bulb`). Also `!stats`."],
      ["!dev <deviation>", "Info about any deviation: rarity, type, variations and skins."],
      ["!hunttop", "The leaderboard link. Also `!leaderboard`."],
      ["!hunt", "A quick how-to-play reminder in chat."],
    ] },
    { id: "streamer", title: "Streamer & Mod Commands", note: "For the broadcaster and moderators, in your own chat.", rows: [
      ["!hunt spawn", "Spawn a random deviation right now."],
      ["!hourlycheck", "Lists everyone whose hourly timer is running in this channel right now, with minutes until their next free Securement Unit."],
      ["!hunt interval <minutes>", `How often deviations appear while you're live (2–120 minutes; default about every ${cfg.SPAWN_INTERVAL_MIN}).`],
      ["!hunt off / !hunt on", "Pause or resume spawns. Other commands keep working."],
      ["!hunt status", "Live status, spawn settings, what's loose right now, and spawn/catch totals for your channel."],
      ["!hunt obs", "Your OBS Source link — a Browser Source that shows the deviation and its countdown on stream while it can be caught."],
      ["!hunt chatdelay <seconds>", `When the OBS Source is on stream, wait this long before posting a new spawn and the catch result in chat so the overlay shows them first (0–30, default ${cfg.RESULT_CHAT_DELAY_SECONDS}).`],
      ["!hunt spawnchat on / off", "Turn off the \"spotted in the wild\" chat message so new deviations only show on your OBS Source. Who caught it / if it got away still posts in chat. Only applies while the OBS Source is open; otherwise chat still announces spawns."],
      ["!hunt surprise on / off", "Surprise mode: chat and your OBS Source show a variation or skin as the normal deviation until the result reveals it. Off (default): chat and the OBS Source name it as soon as it appears."],
      ["!hunt leave", "Remove Deviation Hunt from your channel. Everyone keeps their collections."],
      ["!hunt help", "Lists these mod commands in chat."],
    ] },
    { id: "join", title: "Adding the Game to Your Channel", rows: [
      ["!join", "Type it in the bot's chat (twitch.tv/ohdeviationhunt) to add Deviation Hunt to your channel, or use Add to my channel on deviationhunt.ohwikiguide.com. Then `/mod ohdeviationhunt` in your chat so it isn't rate-limited."],
      ["!leave", "Type it in the bot's chat to remove the game from your channel."],
    ] },
  ];
}

module.exports = { commandSections };
