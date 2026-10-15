# Ranking Score (margin of victory + match difficulty)

**Goal:** Rank by how much better than expected each player's games went, counting the margin of each game and how strong their pair was against the other, instead of by win rate with tie-breaks.

**Why:** Teams are tier-balanced (A+C vs B+B), so most games are close to 50/50 and a night's win rate is mostly luck. Today a 21–19 win counts the same as 21–5, and an easy draw the same as a hard one. Margin of victory alone makes this worse, because easy draws also inflate points. With the tier-gap expectation it gets better.

## The rule (`src/lib/session.ts`)

Per counted game, per player:

- **Value** `gameValue = 0.5·result + 0.5·own/(own+opp)`.
  - Result is win 1, tie ½, loss 0.
  - Any win is worth more than 0.75 and any loss less than 0.25.
  - Winner-only sessions store a nominal 1–0, so the value is just the result.
- **Expected** `expectedValue = clamp(0.5 + 0.1·(own pair's tier points − other pair's), 0.2, 0.8)`.
  - Tier points are A=3, B=2, C=1, taken from current tiers.
  - Partners share it, since tiers can't tell who carried.
- **`Player.perf`** = Σ(value − expected), derived in `recomputePlayerStats`.
- **Score** `performanceScore = 0.5 + perf/(games + 2)`. It is shown as 0–100 (`scoreLabel`), where 50 means as expected.
- **Order:** score, then smoothed win rate, then games, then name.
  - Qualification, medals and the early check are unchanged.
  - The old `oppEdge` and points-share tie-breaks are now inside the score.

The constants `RESULT_WEIGHT`, `TIER_STEP`, `EXPECT_MIN/MAX` and `PRIOR_GAMES` sit next to `gameValue`. The dead `rating` field is removed.

## Measured (`src/lib/rankings.sim.test.ts`, 300 seeded nights each)

| Night | Same-tier pairs ordered right, before → after | Draw luck (rank vs easy draws), before → after |
|---|---|---|
| 12 players, 6 games | 69.9% → 71.5% | 0.234 → 0.198 |
| 16 players, 5 games | 68.9% → 70.3% | 0.246 → 0.219 |
| 16 players, 10 games | 74.1% → 75.7% | 0.306 → 0.202 |

The test's floors and ceilings sit just past the new numbers. Swapping the old comparator back in fails all three.

## UI

- **Rankings rows:** the score is the headline, with "W–L · % won · % pts" beneath it.
- **Info sheet:** explains the rule. The Player view's wording names no tiers.
- **Review screen and share card:** show the score.
- **Session history:** ranks by the session's own result mode.

## Known limits

- **Five or six balanced games are still mostly luck.** The gain is real but small.
- **`TIER_STEP = 0.1` is a judgement call,** not calibrated on real results.
- **Old cached builds:** a viewer on one shows the old order until they reload.
