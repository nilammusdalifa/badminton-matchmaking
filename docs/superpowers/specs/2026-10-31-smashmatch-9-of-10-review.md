# SmashMatch Review & 9/10 Development Plan

Oct 31, 2026 · @nilam

SmashMatch is fair and well built today, and four focused phases (about 7 weeks) can lift every area to 9/10. The biggest gap is not the algorithm but trust: players cannot see why they wait or who they play next.

## Summary

| Area | Today | Target | What holds it back |
| --- | --- | --- | --- |
| Fairness | 8 / 10 | 9 / 10 | "#4 in line" is skipped often; rankings lean on host-set tiers |
| Matchmaking | 8.5 / 10 | 9 / 10 | Groups repeat with 5–6 players on 1 court |
| UI friendliness | 7.5 / 10 | 9 / 10 | Long Manage page, watchers see too little, no serve indicator |

How the review was done: the live site [gobadmin.netlify.app](https://gobadmin.netlify.app/) at phone size (375 px) in Chrome, read-only, as player, umpire and host. Matchmaking was measured by running the app's own code from GitHub `main` (22 Oct 2026, same features as the live site) over 60 simulated evenings per setup.

## Findings by role

**Player.** "Who are you?" with "You're 4th in line" is a strong idea. But as Dadang it said "4th in line" while #6 Wiznu was already in the next match, which feels unfair even though it isn't. The watch view's court card shows only "Court is open", not who plays next, and the ranking explainer is accurate but dense.

**Umpire.** Joining is clear: Watch or Umpire, then a 4-digit PIN with a number keypad. The scorekeeper has big +1 buttons, Undo point and a save step, but no indicator of who is serving (from the code; no live match was run).

**Host.** Very capable: tiers A–D, locked planned matches, hard matches, partner requests, court closing times, and confirmation before End or Erase. But Manage is about 4 phone screens long with 7 players, and the roster (Leave / Not here yet), the most-used control mid-session, sits at the very bottom.

## Findings

Eleven findings, one high: the queue order players see is not the order the app uses.

| ID | Area | Who | Finding | Severity |
| --- | --- | --- | --- | --- |
| F1 | Fairness (perceived) | Player | "#4 / You're 4th in line" while #6 plays first. The order is skipped in 36% of matches (7 players, 1 court) and 70–76% (12–16 players, 2 courts). | High |
| F2 | UI | Player | Watch view's court card hides the planned match. | Medium |
| F3 | Matchmaking | All | 6 players on 1 court: worst night has about 3 different groups in 9 matches, 2.25 partners each out of 5. | Medium |
| F4 | Fairness | Player | Rankings measure results against host-set tiers, so a mis-tiered player rises or sinks unfairly. Same-tier order is right only about 70–76% of the time (project's own ranking sim). | Medium |
| F5 | Security | Host | 4-digit umpire PIN (10,000 options) with no limit on guesses; an umpire can change scores. | Medium |
| F6 | UI | Umpire | Scorekeeper shows no server or service side. | Medium |
| F7 | UI | Host | Roster sits at the bottom of a 4-screen Manage page. | Medium |
| F8 | UI | All | Queue cards are about 140 px each, so the Session tab grows fast. | Low |
| F9 | UI | Player | Join screen says "Join session" without naming it. | Low |
| F10 | Accessibility | All | PIN box and closing-time box have no screen-reader label. | Low |
| F11 | Rankings | Player | "How rankings work" is long and maths-heavy for casual players. | Low |

## Matchmaking simulation

Rotation is fair at every size: nobody ends more than 2 games behind and nobody plays 3 in a row from 6 players up. Variety breaks down only with 5–6 players on 1 court.

| Setup | Most games behind | Most in a row | Longest wait (min) | Partners per person | New group each match (worst night) | Queue order skipped |
| --- | --- | --- | --- | --- | --- | --- |
| 5 players, 1 court | 1 | 4 (unavoidable) | 23 | 2.8 | 45% | 23% |
| 6 players, 1 court | 1 | 2 | 23 | 2.25 | **27%** | 12% |
| **7 players, 1 court (your setup)** | 1 | 2 | 23 | 4.3 | 100% | 36% |
| 12 players, 2 courts | 2 | 2 | 53 | 4.9 | 88% | 68% |
| 16 players, 2 courts | 2 | 1 | 66 | 3.9 | 100% | 75% |
| 16 players, 4 arrive at 20:00 | 2 | 2 | 82 | 3.9 | 100% | 76% |

60 evenings per setup, 19:00–22:00, matches lasting 14–23 minutes. "Longest wait" is the worst on any night. Teams stayed within about half a tier point of each other on average. All 61 of the project's own simulation tests pass at the default 60 evenings; 3 fail at 20, so they depend on sample size.

## What 9/10 looks like

A 9/10 app is one where every player can answer "when do I play, with whom, and why" from their own phone, and the numbers behind it hold at every group size.

| Area | 9/10 means | Moves that get there |
| --- | --- | --- |
| Fairness | Every wait has a visible reason. The queue label matches how picks are made. A mis-tiered player is flagged to the host within 3 matches. Umpire access can't be guessed. | F1, F4, F5 |
| Matchmaking | 5–9 players on 1 court get a new group in at least 60% of matches and at least 3 partners each. Larger groups keep today's numbers (games gap ≤ 2, never 3 in a row). Simulations are stable at any number of evenings. | F3, sim hardening |
| UI friendliness | A watcher sees their next match on the court card. The host reaches the roster in 1 tap. The umpire sees who serves. The queue fits 8 players on one phone screen. All inputs have labels. | F2, F6, F7, F8, F9, F10, F11 |

## Development plan

Four phases over about 7 weeks: quick wins first so players feel the change in week 1, then trust, then matchmaking depth, then umpire polish. Effort is a rough estimate for one developer: XS under half a day, S about 1 day, M 2–3 days.

| # | Task | Fixes | Where | Done when | Effort |
| --- | --- | --- | --- | --- | --- |
| **Phase 1 · Quick wins · week 1** |  |  |  |  |  |
| 1.1 | Replace "You're 4th in line" with honest wording, e.g. "Waiting 2nd longest", plus "Not in next match · balancing teams" when passed over | F1 | `src/lib/copy.ts` (`youPosition`), `SessionTab.tsx` | No player sees a position without a reason when someone below them plays | S |
| 1.2 | Show "Up next: A & B vs C & D" on the watcher's court card | F2 | `CourtCard.tsx`, `SessionTab.tsx` | Watch view shows the same planned match as the host | S |
| 1.3 | Name the session and time on the join screen | F9 | `RemoteGate.tsx` | "Join GoBadmin · Wed 19:00" | XS |
| 1.4 | Add `aria-label` to the PIN and closing-time inputs | F10 | `RemoteGate.tsx`, `ManageTab.tsx` | Accessibility audit finds no unlabelled input | XS |
| 1.5 | Move the roster to the top of Manage, or add a jump link | F7 | `ManageTab.tsx` | Roster reachable in 1 tap from Manage | S |
| **Phase 2 · Fairness and trust · weeks 2–3** |  |  |  |  |  |
| 2.1 | 6-digit PIN from `crypto.getRandomValues`, and a cap on wrong guesses per device | F5 | `firebaseSync.ts` (`generateSessionPin`, `claimUmpireAccess`), `database.rules.json` | 1,000,000 options; 5 wrong tries lock that device for 10 minutes | M |
| 2.2 | Tier check: after 3+ matches, suggest a tier change when a player's score stays far from 50 | F4 | `session.ts` (`expectedValue`), `ManageTab.tsx` roster | Host sees "Fery may be tier A" with one-tap accept | M |
| 2.3 | A reason line for each waiting player ("sat out 2 · plays next", "balancing tiers") | F1 | `session.ts` (`buildSuggestion`), `SessionTab.tsx` | Every queue row shows why it is where it is | M |
| 2.4 | One-sentence rankings summary, full maths behind "More" | F11 | `RankingsTab.tsx`, `copy.ts` | Explainer fits one phone screen before "More" | XS |
| **Phase 3 · Matchmaking depth · weeks 4–5** |  |  |  |  |  |
| 3.1 | Penalty for repeating a group or partner when 9 or fewer are waiting | F3 | `session.ts` (`pickFour`, `planQueue`) | 6 players / 1 court: new group ≥ 60% on the worst night, ≥ 3 partners each, games gap still ≤ 1 | M |
| 3.2 | Add 5–9 player, 1-court scenarios and the queue-skip metric to the sim | F1, F3 | `matchmaking.sim.test.ts` | New scenarios run in CI | S |
| 3.3 | Make sims stable: fixed seed per scenario, or assert only at 60 evenings | — | `matchmaking.sim.test.ts` | Same result at 20 and 60 evenings | XS |
| **Phase 4 · Umpire and polish · weeks 6–7** |  |  |  |  |  |
| 4.1 | Serve indicator: who serves and from which side, from the score | F6 | `ScorekeeperSheet.tsx` | Matches badminton doubles rules in a test of 20 rallies | M |
| 4.2 | Compact one-line queue rows; Skip and Rest behind a tap | F8 | `SessionTab.tsx` | 8 queue rows fit one 375 × 667 screen | M |
| 4.3 | End-to-end test: host starts, umpire scores, watcher sees it; refresh and offline mid-match | — | new Playwright test | Passes on every PR | M |
| 4.4 | Real-phone check on a mid-range Android, in bright light | — | manual | No step needs zoom or a second try | S |

## How to know it's 9/10

Each area reaches 9/10 when its checks below pass; the simulation numbers come from the same 60-evening runs as above.

| Area | Check | Today | Target |
| --- | --- | --- | --- |
| Fairness | Queue rows passed over with no reason shown | most skips (36–76% of matches) | 0 |
| Fairness | Wrong PIN guesses allowed per device | unlimited | 5, then a 10-minute lock |
| Fairness | Mis-tiered player flagged to the host | never | within 3 matches |
| Matchmaking | New group each match, 6 players / 1 court, worst night | 27% | ≥ 60% |
| Matchmaking | Partners per person, 6 players / 1 court | 2.25 | ≥ 3 |
| Matchmaking | Games gap, 12–16 players / 2 courts | ≤ 2 | ≤ 2 (no regression) |
| UI | Taps from Manage to a player's Leave button | ~4 screens of scrolling | 1 |
| UI | Queue rows on one 375 × 667 screen | about 3–4 | 8 |
| UI | Unlabelled inputs | 2 | 0 |
| UI | 5 casual players can say who they play next from the watch view | not yet possible | 5 of 5 |

The last check is a quick hallway test: hand the watch link to five players at the next session and ask.

## Keep, not checked, notes

**Keep as is.** Even games and no long streaks; teams balanced by tier; tiers hidden from watchers; confirmation before End and Erase; the PIN is checked on the server; every button at least 44 px; text contrast passes; no console errors.

**Not checked yet.** A live match end to end, umpire access with the PIN, the share image, refresh or offline mid-match, two umpires scoring at once, the new-session wizard, and speed on a real phone. Tasks 4.3 and 4.4 cover these.

**Notes.**

- Your local folder `H:\Nilam\Projects\gobadmin` is behind GitHub `main` and lacks the live site's newest features. Pull before starting Phase 1. *(Done 31 Oct 2026: fast-forwarded to `56966aa`.)*
- The PIN is made with `Math.random`; task 2.1 moves it to `crypto.getRandomValues`.
- The audit simulation used for this review (small groups and the queue-skip metric) is ready to add as task 3.2.
