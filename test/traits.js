// Checks every rolled specimen obeys the Deviation Trait Page rules for combat deviations.
process.env.TWITCH_CLIENT_ID ||= "x"; process.env.TWITCH_CLIENT_SECRET ||= "x"; process.env.ADMIN_KEY ||= "k";
const traits = require("../traits");
const data = require("../data");
(async () => {
  await Promise.all([traits.refresh(), data.refresh()]);
  let bad = 0, n = 0;
  const pw = [0, 0, 0, 0, 0, 0], own1 = {}, own2 = {};
  for (const d of data.all()) {
    const a = traits.allowed(d.name);
    const ok1 = new Set([...a.slot1General, ...a.slot1Own].map((t) => t.key));
    const ok2 = new Set([...a.slot2General, ...a.slot2Own].map((t) => t.key));
    const ok3 = new Set(a.slot3.map((t) => t.key));
    for (let i = 0; i < 2000; i++) {
      const v = d.variants.length && Math.random() < 0.3 ? d.variants[0].name : "";
      const s = traits.rollSpecimen(d.name, v); n++;
      if (!ok1.has(s.t1) || !ok2.has(s.t2) || !ok3.has(s.t3) || s.power < 1 || s.power > 5 || s.mood < 1 || s.mood > 5) { bad++; if (bad < 5) console.log("BAD", d.name, s); }
      pw[s.power]++;
      if (a.slot1Own.some((t) => t.key === s.t1)) own1[d.name] = (own1[d.name] || 0) + 1;
      if (a.slot2Own.some((t) => t.key === s.t2)) own2[d.name] = (own2[d.name] || 0) + 1;
    }
    console.log(d.name.padEnd(20), "slot1 own:", a.slot1Own.map((t) => t.name).join(",") || "-", "| slot2 own:", a.slot2Own.map((t) => t.name).join(",") || "-");
  }
  const s = traits.rollSpecimen("Dr. Teddy", "Infrasonic Illusion");
  console.log("sample:", s, traits.shortTraits(s));
  console.log("specimens", n, "rule violations", bad, "power dist", pw.slice(1));
  process.exit(bad ? 1 : 0);
})();
