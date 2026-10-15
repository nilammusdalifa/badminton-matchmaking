# Matchmaking Balance (even splits + requested-pair opponents)

**Goal:** Fewer lopsided matches, without anyone waiting longer or groups repeating.

**Why:**
- **Groups ignore tier.** Teams are split by tier (`pickBalancedFoursome`), but the four are picked without looking at tiers (`pickFour`). So 5–9% of matches had teams 2 tier points apart (A+A+A+C or A+C+C+C groups, which no split can even out), and about half were 1 apart.
- **Requested pairs ignore tier and the back-to-back limit.** Their opponents were just the next two in line.

## The rules (`src/lib/session.ts`)

**`pickFour`:**
- The cost formula is unchanged.
- **Equal costs** go to the group with the smallest `bestSplitGap`, the best tier-point gap any split of the four can reach (from `LEVEL_RANK`).
- **Next to a hard game,** while an A with a C is being avoided (`opts.avoidAC`), this is off. Even groups like A+C vs A+C are what that steers away from.
- Balance only chooses between groups that are otherwise equal, so it never costs anyone a turn.

**Requested pairs (`pickFillers`):**
1. Players at the back-to-back limit sit out while two others can play.
2. Must-play players are always taken.
3. Otherwise the pair from the first 4 in line whose tier points come closest to the requested pair's is chosen, earlier in line first.
4. Shuffle steps through that order.

The organizer's note reads "Opponents closest in tier (A+A vs B+B)". The Player view's reasons name no tiers.

## Measured (`matchmaking.sim.test.ts`, "match balance")

Average tier gap / share of matches 2+ apart, 60 nights, roster order:

| Night | Before | After |
|---|---|---|
| 15 players 3A/5B/7C | 0.686 / 7.8% | 0.340 / 3.2% |
| Same, hard games on | 0.597 / 4.7% | 0.532 / 6.2% |
| 16 players, 2 courts | 0.498 / 6.3% | 0.310 / 2.0% |
| 12 players, 2 courts | 0.576 / 2.7% | 0.520 / 2.7% |
| 20 players, 3 courts | 0.504 / 3.5% | 0.342 / 2.7% |

**Two caveats:**
- **The hard-games night's 2+ share rose.** Evening out early matches (A+C vs B+B) spends the scarce B players and leaves A+C+C+C groups later. With the roster shuffled, the same night goes 0.637 / 6.0% → 0.423 / 3.3%.
- **Over 6 night types × 2 roster orders,** the averages are 0.60 → 0.37 and 5.8% → 2.8%.

## One threshold changed (approved)

**What it compared:** "18/20/24 players: locked plans wait no longer than previews" compared each mode's single worst night.
- **For 18 players,** one night in 60 went to 65 min locked vs 62 previewed.
- **Averages** stayed within 0.1 min, and the 90th percentile was 60 → 61.
- **Seeds 777 and 2024** (200 nights each) were identical to the current code in every column. The current code itself reaches 66–68 min worst on those seeds.

**The change:** 18 players now compares the 90th-percentile wait. 20 and 24 keep the worst-night check and also check the 90th percentile. No other threshold changed.

## Next
**A fourth tier (D below C), as its own plan.** In a throwaway simulation it cut lopsided matches about as much as this change, and the two add up. `bestSplitGap` and `pickFillers` read only `LEVEL_RANK`, so they're ready for it.
