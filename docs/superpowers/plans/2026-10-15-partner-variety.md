# Partner Variety

**Goal:** Win back the partner variety the even-split tie-break cost, without giving up its balance.

**Why:** The even-split tie-break in `pickFour` favoured the same evenly balanced combinations, so small groups met fewer different partners (6 players 3.0 → 2.3, 8 players on 1 court 4.3 → 3.7).

## The rule (`pickFour`, `src/lib/session.ts`)

Between groups that cost exactly the same, in order:

1. **Not a group no split can even out** (`bestSplitGap` of 2 or more). Skipped while an A with a C is being avoided next to a hard game.
2. **Fewer repeated partnerships** in the split `pickBalancedFoursome` will make. `pickFour` now gets the partner counts (`opts.partner`).
3. **The more even split** (that split's tier gap).

The cost formula is unchanged, so neither balance nor variety ever costs anyone a turn.

## Three orders measured (10 night types × 2 roster orders, 60 nights each)

| Tie-break order | Different partners | Pairs repeated | Avg tier gap | Matches 2+ apart |
|---|---|---|---|---|
| Even split only (before) | 4.00 | 3.25 | 0.346 | 2.17% |
| Fresh partners, then even split | 4.22 | 2.27 | 0.375 | 2.84% |
| **Not-unsplittable, fresh partners, even split** | **4.21** | **2.34** | **0.369** | **2.42%** |
| Even split, then fresh partners | 4.12 | 2.79 | 0.342 | 2.08% |

The chosen order has nearly all of the variety of the first alternative and keeps most of the balance. Per night, 12 players go 4.64 → 4.85 partners and 2.8 → 1.9 repeated pairs; 8 players on 1 court 3.66 → 4.65 and 4.0 → 0.0; 20 players on 3 courts 5.35 → 5.51 and 2.5 → 1.0.

## Two thresholds touched

- **12 players, 2 courts:** the recorded worst wait went 56 → 57 min. The 90th percentile is 1 min longer on all three seeds measured (50 → 51, 51 → 52, 52 → 53); averages within 0.3 min; 15, 16 and 8 players identical.
- **The match-balance ceilings** (own tests from the previous change) moved up a little to the new measured values (e.g. 15 players 0.36 → 0.39). That is the explicit trade-off.

New "partner variety" tests fail on the old order.
