# Relief Games For C Players Who Carry A D

**Goal:** What hard games do for A/B players who carry a weaker partner, for C players who carry a D.

## The rule (`src/lib/hardGames.ts`, `buildSuggestion`)

A C who has carried a D partner twice since their last **D-free match** (all four known, none in tier D) is due a D-free match. `dCarriesSinceRelief` counts it the same way `carriesSinceHard` counts the A/B ones: any D-free match, even one still on court, resets its C players; a completed match adds 1 for each C whose partner is a D.

`hardGamePick` now returns a `kind`:

1. **"upper"** (unchanged): all A/B, for an A/B who has carried a C or D.
2. **"mid"**: a match with no D, for a due C. Due Cs and must-play players are forced in; the rest come from players in A–C. Chosen only when no upper hard game applies.

Both are blocked while a hard game is on court or planned. "Mid" is also blocked while a D must play, so it never costs a D their turn. It follows the Hard games switch, loses to a requested pair, and shows as "No-D game · Imat carried 2 games ·" in the organizer's note (hidden in the Player view). Planned items carry `noD`; a kept one is re-picked when the switch goes off or a tier change puts a D in it.

## Measured (`matchmaking.sim.test.ts`, "relief games")

Worst D-carries a C reached, hard games off → on, roster order / shuffled:

| Night | Worst carries |
|---|---|
| 15 players 3A/4B/4C/4D | 4 → 3 / 3 → 3 |
| 16 players 2A/3B/5C/6D | 4 → 4 / 4 → 3 |
| 12 players 2A/2B/4C/4D | 4 → 3 / 4 → 3 |
| 20 players 4A/5B/5C/6D, 3 courts | 3 → 3 / 5 → 4 |

- **Never worse and lower in five of eight cases.** About one relief game per night (0.8–1.6).
- **Waits stay within the hard-game allowance** (a C or D one match longer); back-to-back is unchanged.
- **Two nights dip** to 0.93–0.94 on the worst new-group ratio (one repeated group), and the average tier gap rises 0.03–0.05.
- **Nights with no D are unchanged** (the rule never fires).

## Limits

- The threshold is 2 carries, as for hard games, so a C can still reach 3 (and 4 on one night) before a game fits.
- It needs four players in A–C who are free, so nights with mostly Ds rarely get one.
