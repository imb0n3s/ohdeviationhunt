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
  common:    ["Butterfly Emissary", "By-the-Wind", "Dr. Teddy", "Grumpy Bulb", "Mini Feaster",
              // crafting
              "Artisan's Touch", "Atomic Lighter", "Disco Ball", "Frog the Leaper", "Harveseed", "Hug-in-a-Bowl", "Ice Pot", "Party Monkey", "Pup Buddy", "Snow Globe",
              // territory
              "Buzzy Bee", "Chefosaurus Rex", "Electric Eel", "Fetch-A-Lot Bunny", "Flame Essence", "Growshroom", "Logging Beaver", "Nutcracker", "Paper Doll", "Rain Man", "Tar Pudding"],
  uncommon:  ["Enchanting Void", "Festering Gel", "Mini Wonder", "Polar Jelly", "Voodoo Doll", "Zapamander",
              "Atomic Snail", "Dreamcatcher", "Gingerbread House", "Masonic Pyramid", "Orb Lightning", "Strange Door", "Upper World Spawn",
              "Director Fox", "Doctor Raven", "H37", "Hydronaut Fish", "Lethal Rabbit", "Wish Box"],
  rare:      ["Invincible Sun", "Lonewolf Whisper", "Mr. Wish", "Snowsprite", "Whalepup",
              "Space Turner", "Extradimensional Cat", "Rebecca", "The Digby Boy"],
  epic:      ["Pyro Dino", "Shattered Maiden", "ZapCam", "Zeno-Purifier"],
  legendary: ["Behemoth", "Brave George", "Soul Summoner"],
};

// A spawn can be a Variation (from the wiki's Variations tab) or a Skin — the game's "shinies".
const VARIANT = {
  variation: { chance: 1 / 12, catchMult: 0.85, rewardMult: 2, label: "Variation" },
  // skinned versions are always Legendary with a flat 9% capture rate
  skin:      { chance: 1 / 40, catch: 0.09, rarity: "legendary", rewardMult: 1, label: "Skin" },
};

// One kind of Securement Unit (the "ball"), bought with Starchrom.
const UNITS = {
  standard: { label: "Securement Unit", price: 500, mult: 1.0, aliases: [] },
};

const ECONOMY = {
  starterStarchrom: 200,
  starterUnits: { standard: 5 },
  hourlyUnits: 1,            // free Securement Units every hour, only while the stream you did !daily in is live (no cap)
  daily: { starchrom: 100, units: { standard: 1 } },
  dailyCooldownHours: 20,
  newSpeciesBonus: 100,   // first time you secure a deviation (or a new variant of it)
  escapeSalvage: 3,       // Starchrom for a failed attempt, so trying is never a total loss
  scrapValue: 0.5,
  destroyValue: 500,      // Starchrom for destroying one extra specimen from the panel (you always keep at least one)
  destroyUnits: 1,        // ...plus this many Securement Units back        // !scrap pays this fraction of the catch reward for each duplicate
  maxCatchChance: 0.95,
};

const lookup = {};
for (const [tier, names] of Object.entries(ASSIGN)) for (const n of names) lookup[n.toLowerCase().replace(/[^a-z0-9]/g, "")] = tier;
const rarityOf = (name) => lookup[String(name).toLowerCase().replace(/[^a-z0-9]/g, "")] || "uncommon";

// Only one unit type now; anything typed after !secure is ignored
function unitKey() { return "standard"; }

module.exports = { TIERS, ASSIGN, VARIANT, UNITS, ECONOMY, rarityOf, unitKey };
