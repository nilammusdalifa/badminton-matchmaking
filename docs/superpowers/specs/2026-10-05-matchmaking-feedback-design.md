# Matchmaking feedback: arrival order, one plan per court, automatic hard games, waiting timer

Date: 2026-10-05
Status: approved design, awaiting spec review

## Why

Feedback from the organizer after a real session (15 players, 2 courts, roughly 3 A / 5 B / 7 C — the mix varies):

1. **Round 1.** The first people to arrive go straight onto a court, whatever their tier; balanced pairing by tier only matters after that. The app picks round 1 by roster order, because it never records when anyone checked in.
2. **Only one "next" match with two courts.** `queueDepth` plans ahead only once 8 or more are waiting. With 15 players / 2 courts, 7 wait, so the Session tab shows a single "Next Up · all courts busy" preview. The organizer wants one prepared match per court — courts often finish close together, and even when they don't, having both ready is easier. Players still on court may be included in the later planned match so the groups keep changing.
3. **Hard games.** After carrying a weaker partner for a game or two, A/B players ask for a game without anyone to carry. The organizer wants the app to arrange these automatically: upper tiers together on one court, lower tiers together on the other (on one court: an upper-tier match), while the rotation stays fair.

Plus one addition from comparing with BadminCrew (badmincrew.app): a **waiting timer in minutes**.

### What the BadminCrew test showed

Seven matches run through BadminCrew's "Randomizer" (skill matching *Normal*, 15 players 4A/5B/6C, 1 then 2 courts). The person first in the queue anchors the match and everyone else must be within one grade of them; anyone outside that band is skipped. With two courts this settled into an A/B court and a B/C court. In 7 matches the longest waiter was skipped 5 times (two Cs twice each, one C while another C played back-to-back). Lessons taken here:

- A hard game must **never** skip a lower-tier player who is due to play.
- While upper tiers have a hard game, the other court should avoid putting an A with a C.
- The live minutes-waiting timer made unfair waits obvious at a glance.

Not adopted: a global skill-strictness setting (conflicts with automatic hard games), sub-grades, the "schedule now / wait for the other court" prompt (one plan per court covers it), and the non-matchmaking features (bill split, shuttle count, QR self check-in), which can be separate projects.

## Success criteria

- Round 1 suggestions follow check-in order; the organizer can still enter matches by hand.
- With N open courts, N matches are planned (when enough players exist to fill them).
- Every A/B player gets a hard game after at most about 2–3 carry games, on nights with 4+ A/B players.
- No C player who has reached "must play" is ever left out because of a hard game.
- Maximum wait, back-to-back games and repeated foursomes are no worse than today's simulation numbers.
- Each waiting player shows how many minutes they have been waiting.

## Design

### 1. Arrival order and the waiting timer

New optional player field **`idleSince: number`** (epoch ms): when the player last became free to play.

Stamped when a player:
- checks in, or is added as already checked in ("Check In All" stamps everyone with the same time);
- comes back from Rest, or rejoins after leaving;
- has their match saved or cancelled (they are back in the line).

**Tie-break.** `playerPriority` sorts by `priorityScore` as today; equal scores go to the earlier `idleSince`, then roster order. Players without `idleSince` (saved before this change) sort after those with one. `idleSince` only breaks ties — it never overrides waiting count, the back-to-back limit or group mixing. At the start of a night everyone ties, so the first four to check in fill the first court, the next four the second. Teams are still split by tier.

**Timer.** Each Waiting row shows whole minutes since `idleSince`, driven by the existing one-second `tick`:

> Waited 2 matches · 14 min · 3 games played

No timer for resting / not-checked-in players or when `idleSince` is missing. Shown in the read-only Player view too (it reveals no tiers).

`idleSince` is saved and synced like every other player field.

### 2. One planned match per court

The planned list ("Up next", "Then", …) holds **as many matches as there are open courts** — courts that are not paused and not within the 15-minute closing window. 1 court → 1, 2 → 2, 3 → 3. This replaces the `queueDepth` thresholds.

**Who each planned match draws from.** Planned match *j* is for the *(j+1)*-th court to free. It is picked from the players free when it starts: everyone waiting now, plus players on the courts that will have finished by then, longest-running court first (the existing `planQueue` simulation). Players who just came off court carry the usual back-to-back penalty and are never picked for a third match in a row while others are free. If fewer than four can be found for a slot, planning stops there.

Example, 15 players / 2 courts: *Up next* comes from the 7 waiting; *Then* from the 3 left over plus the 4 coming off the longest-running court.

**Locking** works as today: a planned match starts exactly as shown on whichever court frees first; if a player in it rests, leaves or is edited, that match and those after it are re-picked. Shuffle and Edit work per planned match. Labels: "Up next · first court to free", "Then · next court to free".

**Plan ahead off.** The single "Next Up · all courts busy" preview is replaced by the same per-court list, shown as unlocked previews that recompute live.

**Risk.** The old threshold existed because small groups (e.g. 12 players / 2 courts) can freeze into repeated foursomes when everything is locked ahead. The simulation covers 12, 15, 16 players on 2 courts and 8 on 1 court. If any gets worse than today, the fallback is: lock only the first planned match for that group size and show the rest as previews.

### 3. Automatic hard games

**Definitions**
- *Upper tier* = A or B. A *hard game* has all four players upper tier.
- A *carry game*, for an upper-tier player, is a match where their partner was a C. Counts every match played, including ended-early and not-counted ones.
- *Carries since last hard game*: per upper-tier player, derived fresh from the match list every time (like rankings), so fixing or deleting a match corrects it. Manually entered matches count like any other. A hard game — planned or one that happened naturally — resets the count to 0.
- *Due*: 2 or more carries since the last hard game.

**A planned slot becomes a hard game when all of these hold:**
1. The **Hard games** switch is on.
2. At least one due upper-tier player is free for that slot (Section 2's "free by then" rule).
3. At least four upper-tier players are free for the slot, not counting anyone who would be playing a third match in a row.
4. **No C player in the slot's pool has reached "must play"** (`mustPlayAfter`: waited a quarter of the pool, rounded up). Otherwise the slot is a normal match and the hard game waits for a later slot.
5. No other hard game is already planned or on court — one at a time, so the Cs never sit out a whole round.

**Who is picked:** upper-tier must-play players first; then due players, most carries first, ties to the longest waiter; then other upper-tier players by the normal cost (waiting, games, familiarity). Teams are split by `pickBalancedFoursome` as today.

**The other court.** While a hard game is planned or on court, other picks add a cost penalty to any foursome containing both an A and a C. A preference, not a ban: if unavoidable, the match is still made.

**Display.** The planned match's note reads *Hard game · Budi & Adi carried 2 games*. It goes in `balanceNote`, so the read-only Player view (which hides tiers) leaves it out. Shuffle on a hard game picks another hard game; Edit allows anything.

**The switch.** "Hard games", on by default, in Manage next to "Plan ahead". Saved with the session (missing = on) and synced. Turning it off leaves matches on court alone; planned hard games not yet started are re-picked as normal matches.

Fewer than four upper-tier players present: no hard games, the night runs as today.

## Code layout

| File | Change |
|---|---|
| `src/types.ts` | `Player.idleSince?: number`; `QueueItem.hard?: boolean`; `Suggestion.hard?: boolean` |
| `src/lib/hardGames.ts` (new) | Pure functions: `isHardGame`, `carriesSinceHard`, `hardGameDue`, `canPlanHardGame` (conditions 1–5) |
| `src/lib/session.ts` | `playerPriority` tie-break; `pickFour` options for "upper only (due first)" and "avoid A+C"; depth = open courts in place of `queueDepth`; `planQueue` / `courtSuggestions` consult `hardGames.ts` per slot |
| `src/hooks/useSessionStore.ts` | Stamp `idleSince`; `hardGames` setting + toggle; minutes on waiting rows; per-court list replaces `upNext` |
| `src/lib/persistence.ts`, Firebase sync | Persist `hardGames` and `idleSince` |
| `src/components/tabs/ManageTab.tsx` | "Hard games" switch |
| `src/components/tabs/SessionTab.tsx` | Per-court planned list; "· N min" on waiting rows |

## Testing

Test-first for each unit.

**Unit** (`session.test.ts`, new `hardGames.test.ts`):
- Round 1 follows check-in order; missing `idleSince` sorts last.
- Carry counting, and the reset after both planned and natural hard games.
- Each trigger condition 1–5 in isolation, especially a C at must-play blocking the hard game.
- A+C penalty applies only while a hard game is planned or on court.
- Planned depth equals open courts; paused and closing-soon courts excluded; previews when Plan ahead is off.
- Turning the switch off re-picks unstarted planned hard games.

**Simulation** (`matchmaking.sim.test.ts`, seeded):
- Scenarios: 15 players (3A/5B/7C) on 2 courts and on 1 court; 12 and 16 on 2 courts; 8 on 1 court.
- New metrics: hard games per upper-tier player per night; the most carries any upper-tier player goes without a hard game (target ≤ 3); count of must-play C players left out by a hard game (must be 0).
- Existing metrics (max wait, back-to-back, repeated foursomes, games gap) no worse than today; otherwise apply the Section 2 fallback.

**Manual:** a 15-player, 2-court session in the browser preview through several rounds, checking the plan list, hard-game notes, the A+C avoidance on the other court, and the timer.
