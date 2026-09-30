// shop.js — everything players can buy with Starchrom, used by chat (!shop / !buy) and the
// Twitch panel's Shop tab.
//
// To add an item: add an entry to ITEMS. `grants` says what one purchase gives; add a new
// grant type in applyGrants() if it's something the game doesn't track yet.
//   icon: a file bundled in the extension zip (ext/), or an https://ohwikiguide.com/ image
const { UNITS, GLOVES, ECONOMY, SOUP } = require("./rarity");
// most Securement Units this player can hold
const unitCap = (p) => ECONOMY.unitCap + (p.extra_cap || 0);
// Securement Pods in use = deviations you've caught (each lives in one) + empty Securement Units
const podsUsed = (p) => (p.units.standard || 0) + require("./db").q.countCatchesFor.get(p.user_id).n;

const ITEMS = [
  {
    id: "unit",
    name: "Securement Unit",
    desc: "Houses one deviation you catch with !secure. Only used when a catch succeeds — you need an empty one to throw.",
    price: UNITS.standard.price,
    grants: { units: { standard: 1 } },
    maxQty: 100,
    icon: "unit.png",
    aliases: ["units", "securement", "securementunit", "unit"],
  },
  {
    id: SOUP.id,
    kind: "soup",
    name: SOUP.name,
    desc: `+${SOUP.bonus * 100}% catch chance on every !secure throw for 1 hour. Stacks with your gloves; another bowl adds another hour.`,
    price: SOUP.price,
    grants: { soup: 1 },
    maxQty: 5,
    bonus: SOUP.bonus,
    color: "#fb923c",
    icon: SOUP.icon,
    aliases: ["soup", "capturesoup", "soups"],
  },
  ...GLOVES.map((g) => ({
    id: g.id + "gloves",
    kind: "gloves",
    glove: g.id,
    name: g.name,
    desc: `+${Math.round(g.bonus * 100)}% catch chance on every !secure throw. You wear one pair at a time — a better pair replaces it (no refund; gloves can't be scrapped).`,
    price: g.price,
    grants: { gloves: g.id },
    maxQty: 1,
    bonus: g.bonus,
    rarity: g.rarity,
    color: g.color,
    icon: g.icon || null,
    aliases: [g.id, g.id + "glove", g.id + "gloves"],
  })),
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const find = (idOrName) => {
  const k = norm(idOrName);
  return ITEMS.find((i) => i.id === k || norm(i.name) === k || (i.aliases || []).includes(k)) || null;
};

function applyGrants(p, grants, qty) {
  const got = [];
  for (const [kind, val] of Object.entries(grants)) {
    if (kind === "units") {
      for (const [u, n] of Object.entries(val)) { p.units[u] = (p.units[u] || 0) + n * qty; got.push({ kind: "units", unit: u, n: n * qty }); }
    } else if (kind === "soup") {
      const now = Date.now();
      p.soup_until = Math.max(now, p.soup_until || 0) + SOUP.durationMs * val * qty; got.push({ kind: "soup", until: p.soup_until });
    } else if (kind === "gloves") {
      p.gloves = [val]; got.push({ kind: "gloves", glove: val }); // one pair at a time: replaces the old pair, no refund
    } else if (kind === "starchrom") {
      p.starchrom += val * qty; got.push({ kind: "starchrom", n: val * qty });
    } else {
      throw new Error(`shop: unknown grant type "${kind}"`);
    }
  }
  return got;
}

// Buy qty of an item for player p (a loaded player object; caller saves it).
function purchase(p, itemId, qty) {
  const item = find(itemId);
  if (!item) return { ok: false, error: "unknown_item" };
  if (item.kind === "gloves") {
    if ((p.gloves || []).includes(item.glove)) return { ok: false, error: "owned", item };
    const better = GLOVES.find((g) => (p.gloves || []).includes(g.id) && g.bonus > item.bonus);
    if (better) return { ok: false, error: "outclassed", better, item };
  }
  const replaced = item.kind === "gloves" ? GLOVES.find((g) => (p.gloves || []).includes(g.id)) || null : null;
  qty = Math.floor(Number(qty));
  if (!(qty >= 1 && qty <= item.maxQty)) return { ok: false, error: "bad_qty", max: item.maxQty };
  if (item.grants.units) {
    const room = Math.max(0, unitCap(p) - podsUsed(p));
    if (qty > room) return { ok: false, error: room ? "too_many" : "full", room, cap: unitCap(p), item };
  }
  const cost = item.price * qty;
  if (p.starchrom < cost) return { ok: false, error: "not_enough", cost, have: p.starchrom, item };
  p.starchrom -= cost;
  require("./db").addSpent(cost);
  applyGrants(p, item.grants, qty);
  return { ok: true, item, qty, cost, replaced };
}

// what the panel needs to draw the shop
const catalog = () => ITEMS.map(({ id, kind, glove, name, desc, price, maxQty, icon, bonus, rarity, color }) => ({ id, kind: kind || "item", glove, name, desc, price, maxQty, icon, bonus, rarity, color }));

module.exports = { ITEMS, find, purchase, catalog, unitCap, podsUsed };
