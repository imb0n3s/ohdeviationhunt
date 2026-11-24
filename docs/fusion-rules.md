# Deviation Fusion — rules (B 2026-11-08)

Status: COMING SOON (not built). Placeholder page: /fusion. Can't be fused: Variations, Chaos (docs/site/fusion.json).

## Slots
- **2 outside** deviations = the parents. Both required.
- **Up to 3 middle** deviations (optional).

## Variations/skins that CAN be fused (B 2026-11-08)
Only with the **same kind of deviation** they are on (e.g. a Penguin Hope Mr. Wish only fuses with another Mr. Wish).
All other Variations and Chaos can't be fused. List kept in docs/site/fusion.json (`allowedVariants`).
- **Butterfly Emissary:** Ancient Scroll, Glistening Blue, Starry Night
- **Festering Gel:** Marine Star, Milk Sugar, Spring Rose
- **Grumpy Bulb:** Violet Robe
- **Invincible Sun:** Malevolent Sun
- **Lonewolf Whisper:** Bursting Magma, Distant Tears
- **Mr. Wish:** Penguin Hope, Wish Chefosaurus Rex, Mr Wishmonmon
- **Snowsprite:** Springs Return
- **Voodoo Doll:** Thorny Wedding, Fluffy Curse
- **Whalepup:** Abyssal Whale Dream, Don't Get Wet
- **ZapCam:** Fools Memory

(Bursting Magma also exists on By-the-Wind and Mini Wonder — B listed it for Lonewolf Whisper only.)

## Timing
- A fusion takes **5 minutes** to complete.

## Which deviation comes out
- Default: **50/50** between the two outside parents.
- If any **middle** deviation is the **same deviation as one of the parents**, the result is **100% that parent**
  (e.g. outside Rebecca + X, middle Rebecca → the result is Rebecca, whatever the other middle ones are).
- Only middle deviations that match a parent count; any other middle deviation just gets used up.
- Middle matches BOTH parents: the parent with **more copies in the middle** wins (2 Rebecca + 1 Buzzy Bee → Rebecca).
  A tie (1 + 1) goes back to 50/50 (assumed — B to confirm).

## What happens to the deviations used
- **Middle (up to 3):** all consumed, lost forever, never returned.
- **Outside (2):** returned after the fusion, but with **0 fuse chances** left (can't be fused again).
- **The new fused deviation:** has **1 fuse chance** left.

## Decided (B 2026-11-08)
- Every deviation (existing and new catches) comes with **1 fusion chance**.
- Fusing costs **500 Starchrom**. **Website only** (Fusion page) — not chat, not the panel.

## Monthly subscription (B 2026-11-24) — NOT BUILT YET (shown on /fusion as "Coming Soon")
- **$9.99 USD per month**: Unlimited Fusion Package, through B's Stripe (website only, never in the Twitch panel).
- **Sales tax** collected on top, based on where the buyer is located (Stripe Tax).
- **Unlimited fusions** while subscribed, but every fusion **still costs 500 Starchrom**.
- **Refunds: within 24 hours of buying.**
- Stripe (LIVE, account OHWikiGuide, 2026-11-24): product "Unlimited Fusion Package" prod_Vgpgy0y55SLXjo, price
  price_1UfS19F3l4Jo3nSDMngmglwC ($9.99 USD / month, lookup key `fusion_monthly`). Tax settings: "Include tax in prices" = No
  (tax added on top). Still to do: Stripe Tax registrations (B), Customer Portal, webhook /stripe/webhook (when the code exists),
  Railway env STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (B).

## Skill / Activity of the new deviation (B 2026-11-08)
- Each rating separately: take one parent's number at random (50/50), then randomly −1, same, or +1, kept within 1–5.
  So the result is always within ±1 of the parents' numbers (parents 3/4 and 4/2 → Skill 2–5, Activity 1–5).
- **Two 5/5 parents:** the result is 5/5 except a **0.05% (1 in 2,000)** chance it comes out lower (one or both ratings 4).

## Fusion board (B 2026-11-24)
- During fusing there is a **board** so B can see a visualization of what's going on.

## Traits of the new deviation (B 2026-11-24)
- If only one deviation has a trait: **60% chance** the trait goes over to the new deviation.
- If **both parents** have the same trait: **100%** — it goes to the new deviation.
- Each slot has its own % chance to change the effect of each trait (the % for each slot: not given yet).
- Same trait slot during fusing: another deviation with the **same** trait in that slot adds **+10%** (to the 60%);
  a **different** trait in that slot takes **−10%** off the 60%. Using a **blank** deviation (a clean deviation with no traits) also adds **+10%**. If both parents have the same trait it's **100%** on its own — no middle one needed.
- Traits stay in their own type: **territory** traits only go on territory deviations, **combat** on combat, **crafting** on crafting.
  They can't swap onto another type.
- Same with traits made for a specific **skin or variation**: they can't swap onto one they aren't already on. They only stay
  on the specific ones they're built for.
- Nothing else about traits decided yet — B is going through this slowly, one rule at a time. Don't assume the rest.
