// rarity.js — game balance in one place. Edit freely.
//
// Every combat deviation gets a rarity tier. Anything added to the wiki later that
// isn't listed here becomes "uncommon" until you give it a tier.

const TIERS = {
  common:    { label: "Common",    weight: 40, catch: 0.70, reward: 10,  color: "#9fb0c0" },
  uncommon:  { label: "Uncommon",  weight: 28, catch: 0.55, reward: 20,  color: "#4ade80" },
  rare:      { label: "Rare",      weight: 18, catch: 0.40, reward: 40,  color: "#38bdf8" },
  epic:      { label: "Epic",      weight: 10, catch: 0.25, reward: 80,  color: "#c084fc" },
  legendary: { label: "Legendary", weight: 4,  catch: 0.12, reward: 200, color: "#fbbf24" },
};

const ASSIGN = {
  common: [
    // combat
    "Butterfly Emissary", "By-the-Wind", "Grumpy Bulb", "Mini Feaster", "Enchanting Void", "Festering Gel",
    // crafting
    "Atomic Lighter", "Disco Ball", "Frog the Leaper", "Harveseed", "Hug-in-a-Bowl", "Party Monkey", "Pup Buddy", "Snow Globe", "Dreamcatcher", "Gingerbread House", "Upper World Spawn",
    // territory
    "Buzzy Bee", "Chefosaurus Rex", "Electric Eel", "Fetch-A-Lot Bunny", "Flame Essence", "Growshroom", "Logging Beaver", "Nutcracker", "Paper Doll", "Rain Man", "Tar Pudding", "The Digby Boy",
  ],
  uncommon: [
    // combat
    "Mini Wonder", "Polar Jelly", "Voodoo Doll",
    // crafting
    "Masonic Pyramid", "Orb Lightning", "Strange Door",
    // territory
    "H37", "Hydronaut Fish", "Lethal Rabbit", "Wish Box",
  ],
  rare: [
    // combat
    "Zapamander", "Mr. Wish", "Snowsprite", "Whalepup", "Zeno-Purifier",
    // crafting
    "Ice Pot", "Space Turner",
    // territory
    "Director Fox", "Doctor Raven", "Extradimensional Cat",
  ],
  epic: [
    // combat
    "Dr. Teddy", "Invincible Sun", "Lonewolf Whisper", "Pyro Dino", "Shattered Maiden", "ZapCam", "Brave George", "Soul Summoner",
    // crafting
    "Artisan's Touch", "Atomic Snail",
  ],
  legendary: [
    // combat
    "Behemoth",
    // territory
    "Rebecca",
  ],
};

// A spawn can be a Variation (from the wiki's Variations tab) or a Skin — the game's "shinies".
const VARIANT = {
  // Every variation and skin is Legendary, whatever the base deviation's rarity.
  variation: { chance: 1 / 30, catch: 0.12, rarity: "legendary", rewardMult: 1, label: "Variation" },
  skin:      { chance: 1 / 75, catch: 0.09, rarity: "legendary", rewardMult: 1, label: "Skin" },
  // the Chaos variation (Mini Wonder, Mr. Wish, Snowsprite, Zeno-Purifier): 1 in 750 of ALL spawns, 2.5% capture
  chaos:     { chance: 1 / 750, catch: 0.025, rarity: "legendary", rewardMult: 1, label: "Chaos Variation", names: ["Chaos"] },
};
// which rule a spawned/caught variant follows
const isChaos = (v) => !!v && VARIANT.chaos.names.some((n) => n.toLowerCase() === String(v.name || v).toLowerCase());
const variantRule = (v) => (!v ? null : isChaos(v) ? VARIANT.chaos : VARIANT[v.kind] || null);

// One kind of Securement Unit (the "ball"), bought with Starchrom.
const UNITS = {
  standard: { label: "Securement Unit", price: 500, mult: 1.0, aliases: [] },
};

const ECONOMY = {
  starterStarchrom: 200,
  starterUnits: { standard: 5 },
  hourlyStarchrom: 15,      // Starchrom that comes with each hourly unit (paid even when your pods are full)
  hourlyUnits: 1,            // free Securement Units every hour, only while the stream you did !daily in is live (no cap)
  daily: { starchrom: 100, units: { standard: 1 } },
  dailyResetTz: "America/Chicago", // !daily resets at midnight in this time zone
  newSpeciesBonus: 100,   // first time you secure a deviation (or a new variant of it)
  unitCap: 100,           // most Securement Units a player can hold (+ players.extra_cap, for future Bits capacity blocks)
  throwCost: 10,          // Starchrom per !secure throw. A Securement Unit is only used to HOUSE a caught deviation;
                          // a throw that misses costs just the Starchrom.
  destroyValue: 500,      // Starchrom for scrapping one extra specimen in the panel (you always keep at least one)
  destroyUnits: 1,        // ...plus this many Securement Units back
  maxCatchChance: 0.95,
  // Legendary pool (B 2026-10-08): while a Legendary (variation/skin/Chaos) is loose and shown, viewers can !donate
  // Starchrom. If the pool reaches the goal, everyone who donated AND throws !secure catches it 100%.
  // Pool doesn't fill before time runs out -> every donation is refunded.
  legendaryPoolGoal: 10000,
  legendaryPoolMax: 750,  // most one viewer can put into one Legendary's pool
};

const lookup = {};
for (const [tier, names] of Object.entries(ASSIGN)) for (const n of names) lookup[n.toLowerCase().replace(/[^a-z0-9]/g, "")] = tier;
const rarityOf = (name) => lookup[String(name).toLowerCase().replace(/[^a-z0-9]/g, "")] || "uncommon";

// Only one unit type now; anything typed after !secure is ignored
function unitKey() { return "standard"; }

// Gloves: you wear ONE pair at a time. Buying a better pair replaces yours (no refund, no scrapping); its bonus is added
// straight onto every throw's catch chance (still capped at ECONOMY.maxCatchChance).
// AT BITS LAUNCH (B, 2026-09-30) raise glove prices to match real money at 5 Starchrom/Bit:
//   Rustic 5,000 ($10) · BBQ 10,000 ($20) · Savior 17,500 ($35). Until then they stay at 3,000 / 7,500 / 10,000.
// Capture Soup: +7.5% capture chance for 1 hour after you buy it (another bowl adds another hour). Stacks with gloves.
const SOUP = { id: "soup", name: "Capture Soup", price: 1000, bonus: 0.075, durationMs: 60 * 60 * 1000, icon: "soup.png" };

const GLOVES = [
  { id: "rustic", name: "Rustic Gloves", bonus: 0.03, price: 3000, rarity: "Basic",     color: "#4ade80", icon: "rustic.png" },
  { id: "bbq",    name: "BBQ Gloves",    bonus: 0.05, price: 7500, rarity: "Uncommon",  color: "#c084fc", icon: "bbq.png" },
  { id: "savior", name: "Savior Gloves", bonus: 0.09, price: 10000, rarity: "Legendary", color: "#fbbf24", icon: "savior.png" },
];

// Starchrom bought with Bits in the Twitch panel (5 Bits = 100 Starchrom). Each pack must also exist as a
// Bits product with the same SKU and Bits amount in the extension's Monetization tab.
const BITS_PACKS = [
  // 5 Starchrom per Bit (a Bit is ~1 cent to the streamer). The big packs match the glove prices at launch.
  { sku: "starchrom25",    bits: 5,    starchrom: 25 },
  { sku: "starchrom125",   bits: 25,   starchrom: 125 },
  { sku: "starchrom250",   bits: 50,   starchrom: 250 },
  { sku: "starchrom500",   bits: 100,  starchrom: 500 },
  { sku: "starchrom2500",  bits: 500,  starchrom: 2500 },
  { sku: "starchrom5000",  bits: 1000, starchrom: 5000 },   // = Rustic Gloves ($10)
  { sku: "starchrom10000", bits: 2000, starchrom: 10000 },  // = BBQ Gloves ($20)
  { sku: "starchrom17500", bits: 3500, starchrom: 17500 },  // = Savior Gloves ($35)
  // raises the most Securement Units you can hold (ECONOMY.unitCap) by 5, permanently
  { sku: "pods5",         bits: 50,  capacity: 5 },
];

module.exports = { TIERS, ASSIGN, VARIANT, isChaos, variantRule, UNITS, ECONOMY, GLOVES, SOUP, BITS_PACKS, rarityOf, unitKey };
