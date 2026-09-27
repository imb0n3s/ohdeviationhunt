// Checks every rolled specimen obeys the Deviation Trait Page rules for combat deviations,
// and that variant-specific traits (e.g. Grumpy Bulb - Violet Robe) only appear on that variant.
process.env.TWITCH_CLIENT_ID ||= "x"; process.env.TWITCH_CLIENT_SECRET ||= "x"; process.env.ADMIN_KEY ||= "k";
const traits = require("../traits");
const data = require("../data");
(async () => {
  await Promise.all([traits.refresh(), data.refresh()]);
  let bad = 0, n = 0;
  const fail = (...a) => { bad++; if (bad < 8) console.log("BAD", ...a); };
  for (const d of data.all()) {
    const vnames = d.variants.map((v) => v.name);
    const a = traits.allowed(d.name);
    const o1 = traits.ownOptions(a.slot1Own, vnames), o2 = traits.ownOptions(a.slot2Own, vnames);
    const ok1 = new Set([...a.slot1General, ...a.slot1Own].map((t) => t.key));
    const ok2 = new Set([...a.slot2General, ...a.slot2Own].map((t) => t.key));
    const ok3 = new Set(a.slot3.map((t) => t.key));
    const lockedOnly = (opts) => new Set(opts.filter((o) => o.locked && !opts.some((x) => x.key === o.key && !x.locked)).map((o) => o.key));
    const L1 = lockedOnly(o1), L2 = lockedOnly(o2);
    for (const v of ["", ...vnames]) {
      const want1 = v ? o1.filter((o) => o.locked && traits.variantMatches(o.locked, v)).map((o) => o.key) : [];
      const want2 = v ? o2.filter((o) => o.locked && traits.variantMatches(o.locked, v)).map((o) => o.key) : [];
      for (let i = 0; i < 300; i++) {
        const s = traits.rollSpecimen(d.name, v, vnames); n++;
        if (!ok1.has(s.t1) || !ok2.has(s.t2) || !ok3.has(s.t3)) fail(d.name, v, "slot rule", s);
        if (s.power < 1 || s.power > 5 || s.mood < 1 || s.mood > 5) fail(d.name, "rating", s);
        if (want1.length ? !want1.includes(s.t1) : L1.has(s.t1)) fail(d.name, v || "(base)", "slot1 variant lock", s.t1);
        if (want2.length ? !want2.includes(s.t2) : L2.has(s.t2)) fail(d.name, v || "(base)", "slot2 variant lock", s.t2);
      }
    }
    const show = (o) => o.map((x) => `${x.label || x.key}${x.locked ? "🔒" : ""}`).join(", ") || "-";
    console.log(d.name.padEnd(19), "S1 own:", show(o1), "| S2 own:", show(o2));
  }
  for (const [dev, v] of [["Grumpy Bulb", "Violet Robe"], ["Grumpy Bulb", ""], ["Lonewolf Whisper", "Lunar Oracle"], ["Snowsprite", "Springs Return"]]) {
    const vn = data.all().find((x) => x.name === dev).variants.map((x) => x.name);
    const s = { ...traits.rollSpecimen(dev, v, vn), variant: v };
    console.log(`${dev} ${v || "(base)"} ->`, traits.shortTraits(s), "|", traits.traitEffect(1, s.t1, s.t1_level, v));
  }
  console.log("specimens", n, "rule violations", bad);
  process.exit(bad ? 1 : 0);
})();
