# Tier check findings: can results flag a mis-tiered player?

## The question

Spec 2.2 / F4 asked for a one-tap suggestion that tells the host a player may be
in the wrong tier, "within 3 matches". The idea: when a player's Rankings score
sits far from 50 (65 or above, or 35 or below) after a few matches, suggest the
adjacent tier. The test of whether that is good enough: it must catch a mis-listed
player at least half the time, and must wrongly flag correctly tiered players no
more than 10% of the time. A hint that is mostly wrong costs the host's trust.

## Method

A simulation added to `src/lib/rankings.sim.test.ts` (since discarded), using the
same match model as the existing ranking sims:

- 12 players on 3 courts, every player plays every round, so after r rounds each
  has r matches. Teams are split by the app's own `pickBalancedFoursome`.
- Tiers as in `night()`: A, B, C by position; true skill is the tier's base
  (A 1, B 0, C -1) plus a normal draw with standard deviation 0.5.
- Player p0 is listed C but plays at B level (base 0 plus the same draw).
- Each match is one game to 21, win by 2, capped at 30, rally by rally, with the
  chance of winning a rally set by the logistic of the pair-strength gap times 0.35.
- Scores come from the app's own `recomputePlayerStats` and `scoreLabel`.
- 300 nights, seeded with rng 9000+t. Checkpoints at 3, 5, 8, 10 and 12 matches,
  recorded in the same night. Bounds tried (UP, DOWN): (60, 40), (65, 35),
  (70, 30), (75, 25). No hint above tier A or below tier D.

## Measured

Each cell: p0 flagged % / false flags % among the other 11 players, by matches played.

| Pair | 3 | 5 | 8 | 10 | 12 |
|---|---|---|---|---|---|
| (60, 40) | 47.3/32.5 | 56.0/35.8 | 59.0/33.8 | 62.0/32.7 | 64.7/32.9 |
| (65, 35) | 33.0/21.9 | 37.3/16.9 | 42.0/16.0 | 43.3/16.0 | 43.7/15.3 |
| (70, 30) | 14.3/5.7 | 18.3/7.2 | 23.0/6.4 | 24.0/5.7 | 25.3/5.2 |
| (75, 25) | 1.3/0.2 | 6.0/0.6 | 7.7/1.5 | 9.3/0.9 | 11.3/0.9 |

## Conclusion

No threshold on the Rankings score reaches 50% detection with 10% or fewer false
flags at any checkpoint up to 12 matches. "Within 3 matches" is not achievable.
So no hint was shipped.

## Why

A one-tier gap is one skill unit, but a single match is decided by pair strength,
not one player, and a 21-point game is noisy. After 3 to 5 matches p0's mean score
is only about 54 to 60, while correctly tiered players, whose own skill varies by
half a unit within a tier, regularly reach 62 or more. The two groups overlap, so
any bound that catches the mis-listed player also catches many correct ones. More
matches help detection slowly (the score is pulled toward 50 by its prior and by
averaging across mixed partners), and the spread among correct players does not
shrink enough to separate the groups by 12 matches.

## Directions for later

1. A separate rating from pair-adjusted results (what each match says about this
   player, given the partner and opponents) with a standard-error test: only flag
   when the estimate is clearly past the tier line, not merely past a fixed score.
2. Show the host a "score vs tier expectation" column in the roster instead of a
   suggestion, so they judge it with context and nothing claims certainty.
3. Pool evidence across sessions: with a player's results over several nights,
   samples are large enough that a threshold becomes reliable.
