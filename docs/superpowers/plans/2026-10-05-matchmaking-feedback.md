# Matchmaking Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round 1 follows check-in order, the app plans one match per open court, A/B players who have carried a C partner twice get an automatic all-A/B "hard game" (never at a due C's expense), and waiting players show minutes waited.

**Architecture:** A new per-player `idleSince` timestamp breaks priority ties and drives the timer. `planQueue` plans one item per open court; the store locks a prefix of that plan (all of it when "Plan ahead" is on) and shows the rest as live previews, replacing the single `upNext` preview. Hard-game rules live in a new pure module `src/lib/hardGames.ts`; `buildSuggestion` consults it per slot and `pickFour` gains `forced` / `avoidAC` options.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest (`npm test`), Firebase Realtime Database sync.

**Spec:** `docs/superpowers/specs/2026-10-05-matchmaking-feedback-design.md`

## Global Constraints

- Matchmaking stays deterministic: no `Math.random()` / `Date.now()` inside `src/lib` picking code — time comes in as a parameter. The organizer's and umpire's devices must compute the same plan.
- Hard-game threshold: **2** carries since the last hard game. Upper tier = **A or B**. Hard game = all four upper tier.
- A hard game is never planned while a **C player in that slot's pool is at must-play** (`mustPlayAfter`), or while another hard game is planned or on court.
- The "Hard game" note lives in `balanceNote` so the read-only Player view (`hideTiers`) never shows it.
- Players saved before this change have no `idleSince`; sessions saved before it have no `hardGames` (means **on**).
- Text in the UI is never smaller than 12px (existing rule).
- Do not loosen any existing simulation threshold. If one fails, stop and report the numbers.
- No new dependencies.

## Review Focus

1. **Check In All stamps everyone with the same `idleSince`** — the order must fall back to roster order so both devices agree (test in Task 2).
2. **A deleted player still appears in match history** — carry counting and hard-game detection must not crash and must treat the unknown id as not upper tier (test in Task 5).
3. **A player's tier is changed mid-session** — carries are recounted with the current tier (test in Task 5).
4. **A requested partner pair is pending when a hard game is due** — the organizer's explicit request wins; the match is not flagged hard (test in Task 6).
5. **Hard games switched off while a planned hard game is locked** — that planned match is re-picked as a normal one; matches already on court are untouched (test in Task 6).

---

### Task 1: Simulation harness — tier mix option and baseline numbers

**Files:**
- Modify: `src/lib/matchmaking.sim.test.ts` (Scenario interface ~line 20, `playNight` player creation ~line 64, new constants after `threeCourts` ~line 228)

**Interfaces:**
- Produces: `Scenario.levels?: [a: number, b: number, c: number]` (first `a` players A, next `b` B, rest C; default = today's thirds); `const oneCourt = [both("19:00", "22:00")]`; `const BASELINE: Record<string, { minRatio: number; maxWaitMin: number; gap: number; inARow: number }>` keyed `"12x2"`, `"15x2"`, `"16x2"`, `"8x1"` — today's numbers with `planAhead: true`.

- [ ] **Step 1: Add `levels` to `Scenario` and use it in `playNight`**

When `scenario.levels` is set, player `i` gets `"A"` if `i < a`, `"B"` if `i < a + b`, else `"C"`. Otherwise keep the current thirds formula.

- [ ] **Step 2: Print today's numbers with a temporary test**

Add temporarily at the end of the file:

```ts
it("baseline (temporary)", () => {
  for (const [key, players, courts] of [["12x2", 12, twoCourts], ["15x2", 15, twoCourts], ["16x2", 16, twoCourts], ["8x1", 8, oneCourt]] as const) {
    const r = summarize({ players, courts: [...courts], planAhead: true }, NIGHTS, false);
    console.log(key, JSON.stringify({ minRatio: r.minRatio, maxWaitMin: r.maxWaitMin, gap: r.gap, inARow: r.inARow }));
  }
});
```

Run: `npx vitest run src/lib/matchmaking.sim.test.ts -t "baseline"`
Expected: four lines printed, e.g. `15x2 {"minRatio":…}`.

- [ ] **Step 3: Paste the printed numbers into `BASELINE`, delete the temporary test**

- [ ] **Step 4: Run the whole sim suite**

Run: `npx vitest run src/lib/matchmaking.sim.test.ts`
Expected: PASS (nothing behaves differently yet).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchmaking.sim.test.ts
git commit -m "test: sim tier mix option and today's planning baseline"
```

---

### Task 2: `idleSince` — priority tie-break, stamping helpers

**Files:**
- Modify: `src/types.ts` (Player, after `afterMatch`)
- Modify: `src/lib/session.ts` — `playerPriority` (~line 310), `applyAfterMatch` (~line 1148), `resetPlayersForNewSession` (~line 1110), new `markReady`
- Test: `src/lib/session.test.ts` (new `describe("arrival order")`; update the `applyAfterMatch` call at ~line 290)

**Interfaces:**
- Produces:
  - `Player.idleSince?: number` — epoch ms when the player last became free to play.
  - `markReady(p: Player, now: number): Player` → `{ ...p, status: "ready", idleSince: now }`.
  - `applyAfterMatch(players: Player[], match: Pick<Match, "t1" | "t2">, now: number): Player[]` — now **required**; stamps `idleSince = now` on all four, then applies rest/left as today.
  - `playerPriority(pool)` — ties on `priorityScore` go to the smaller `idleSince`; missing `idleSince` sorts after any present one; still-equal keeps input (roster) order.

- [ ] **Step 1: Write the failing tests**

```ts
describe("arrival order", () => {
  const at = (id: string, idleSince?: number, over: Partial<Player> = {}): Player => ({ ...makeBlankPlayer(id, id, "B", "ready"), ...(idleSince === undefined ? {} : { idleSince }), ...over });

  it("equal priority goes to whoever became free first; unknown times last", () => {
    const order = playerPriority([at("c", 300), at("x"), at("a", 100), at("b", 200)]).map((p) => p.id);
    expect(order).toEqual(["a", "b", "c", "x"]);
  });

  it("the same check-in time (Check In All) keeps roster order", () => {
    expect(playerPriority([at("p2", 50), at("p1", 50), at("p3", 50)]).map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("waiting count still beats arrival time", () => {
    expect(playerPriority([at("early", 1), at("late", 999, { skipped: 1 })])[0].id).toBe("late");
  });

  it("round 1 suggests the first four to check in", () => {
    const players = ["h", "g", "f", "e", "d", "c", "b", "a"].map((id, i) => at(id, 1000 - i * 10)); // a checked in first
    const sug = buildSuggestion(players, [], [], [], 0)!;
    expect(sug.four.map((p) => p.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("a saved or cancelled match stamps its four as free now", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => at(id, 5));
    const out = applyAfterMatch(players, { t1: ["a", "b"], t2: ["c", "d"] }, 777);
    expect(out.map((p) => p.idleSince)).toEqual([777, 777, 777, 777, 5]);
  });

  it("markReady stamps the time; a new session clears it", () => {
    const p = markReady(makeBlankPlayer("a", "A", "B", "expected"), 42);
    expect([p.status, p.idleSince]).toEqual(["ready", 42]);
    expect(resetPlayersForNewSession([p])[0].idleSince).toBeUndefined();
  });
});
```

Also change the existing `applyAfterMatch(players, onCourt)` call (~line 290) to `applyAfterMatch(players, onCourt, 0)`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/session.test.ts -t "arrival order"`
Expected: FAIL (`markReady` not exported; order assertions fail).

- [ ] **Step 3: Implement** `Player.idleSince`, `markReady`, the `playerPriority` tie-break, the `now` parameter on `applyAfterMatch`, and `delete next.idleSince` in `resetPlayersForNewSession`.

- [ ] **Step 4: Run the lib tests**

Run: `npx vitest run src/lib`
Expected: PASS. (`tsc` will flag the store's `applyAfterMatch` calls — Task 3 fixes them; don't run the build yet.)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/session.ts src/lib/session.test.ts
git commit -m "feat: players carry the time they became free; ties go to whoever arrived first"
```

---

### Task 3: Store stamps `idleSince`; waiting rows show minutes

**Files:**
- Modify: `src/hooks/useSessionStore.ts` — `checkIn` (~883), `checkInAll` (~891), `resumePlayer` (~903), `rejoinPlayer` (~962), `addPlayer` (~974), `addPlayers` (~992), the four `applyAfterMatch(` calls (~605, ~629, ~644, ~1385), `waitingVM` (~1774)
- Modify: `src/types.viewmodel.ts` (`WaitingEntry`)
- Modify: `src/components/tabs/SessionTab.tsx` (waiting meta line ~147)

**Interfaces:**
- Consumes: `markReady`, `applyAfterMatch(players, match, now)` (Task 2).
- Produces: `WaitingEntry.waitMin: number | null`.

- [ ] **Step 1: Stamp on every transition to ready**

`checkIn`, `resumePlayer`, `rejoinPlayer`: use `markReady(p, Date.now())` (keep their other field changes). `checkInAll`: one `const now = Date.now()` for everyone it checks in. `addPlayer` / `addPlayers` with `status === "ready"`: stamp the new players with `markReady(…, now)`. Pass `Date.now()` as `now` to all four `applyAfterMatch` calls.

- [ ] **Step 2: Minutes on the waiting row**

`waitingVM` adds `waitMin: p.idleSince ? Math.max(0, Math.floor((Date.now() - p.idleSince) / 60000)) : null` and adds `state.tick` to its dependency list. In `SessionTab`, the meta line becomes:

`Waited {skipped} match(es){waitMin !== null ? ` · ${waitMin} min` : ""} · {games} game(s) played` (keep the existing "Next up · " prefix and back-to-back suffix).

- [ ] **Step 3: Type-check, test, lint**

Run: `npm run build && npm test && npm run lint`
Expected: build succeeds, all tests PASS, no lint errors.

- [ ] **Step 4: Check it in the app**

Start the dev server with `preview_start` (`.claude/launch.json`). Check in three players one after another; Waiting shows them in that order with "· 0 min"; after a minute the count reads "· 1 min". Start and save a match: its four reappear at the bottom with "· 0 min".

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSessionStore.ts src/types.viewmodel.ts src/components/tabs/SessionTab.tsx
git commit -m "feat: arrival order from check-in time; waiting players show minutes waited"
```

---

### Task 4: Plan one match per open court

**Files:**
- Modify: `src/lib/session.ts` — remove `queueDepth` (~581); `planQueue` (~626); new `lockedCount`
- Test: `src/lib/session.test.ts` (`describe("matches planned ahead …")` ~759)
- Test: `src/lib/matchmaking.sim.test.ts` (`playNight` planning loop ~114; new describe)

**Interfaces:**
- Consumes: `BASELINE`, `oneCourt` (Task 1).
- Produces:
  - `planQueue(args)` — depth = number of open courts (not paused, not closing soon); the `slack` / `queueDepth` gating is gone; planning still stops at the first slot that can't find four. New optional arg `seeds?: Record<number, number>`: the seed for a **non-kept** position `j` is `seedAt.seed` when `seedAt.index === j`, else `seeds?.[j] ?? 0`.
  - `lockedCount(depth: number, planAhead: boolean): number` → `planAhead ? depth : 0`. The store and the sim lock `plan.slice(0, lockedCount(...))` and hand the **full** plan to `courtSuggestions`.

- [ ] **Step 1: Rewrite the depth tests**

In `session.test.ts`: delete the `queueDepth` test, the "plans nothing with 12 players…" test and the "does not count the four who just finished…" test; remove `queueDepth` from the import. Add:

```ts
it("plans one match per open court", () => {
  expect(plan()).toHaveLength(2);
  const three = [...courts, { id: "3", name: "Court 3" }];
  const matches = [live("a", ["p0", "p1", "p2", "p3"], "1"), live("b", ["p4", "p5", "p6", "p7"], "2"), live("c", ["p8", "p9", "p10", "p11"], "3")];
  let players = applyMatchStart(roster(24), [], ["p0", "p1", "p2", "p3"]);
  players = applyMatchStart(players, [matches[0]], ["p4", "p5", "p6", "p7"]);
  players = applyMatchStart(players, matches.slice(0, 2), ["p8", "p9", "p10", "p11"]);
  expect(planQueue({ players, matches, courts: three, requestedPairs: [], existing: [], now, enabled: true })).toHaveLength(3);
  expect(plan({ courts: [courts[0], { ...courts[1], paused: true }] })).toHaveLength(1);
  expect(plan({ courts: [courts[0], { ...courts[1], closesAt: "19:40" }] })).toHaveLength(1); // now = 19:30
});

it("15 players on 2 busy courts: Up next from the 7 waiting, Then may use the longest court", () => {
  const matches = [live("a", ["p0", "p1", "p2", "p3"], "1"), live("b", ["p4", "p5", "p6", "p7"], "2")];
  const players = applyMatchStart(applyMatchStart(roster(15), [], ["p0", "p1", "p2", "p3"]), [matches[0]], ["p4", "p5", "p6", "p7"]);
  const q = planQueue({ players, matches, courts, requestedPairs: [], existing: [], now, enabled: true });
  expect(q).toHaveLength(2);
  expect(ids(q[0]).every((id) => Number(id.slice(1)) >= 8)).toBe(true);
  expect(ids(q[1]).some((id) => ["p4", "p5", "p6", "p7"].includes(id))).toBe(false);
  expect(ids(q[1]).filter((id) => ids(q[0]).includes(id))).toEqual([]);
});

it("12 players on 2 courts now plans both; switched off plans nothing", () => {
  const matches = [live("a", ["p0", "p1", "p2", "p3"], "1"), live("b", ["p4", "p5", "p6", "p7"], "2")];
  const players = applyMatchStart(applyMatchStart(roster(12), [], ["p0", "p1", "p2", "p3"]), [matches[0]], ["p4", "p5", "p6", "p7"]);
  expect(planQueue({ players, matches, courts, requestedPairs: [], existing: [], now, enabled: true })).toHaveLength(2);
  expect(plan({ enabled: false })).toEqual([]);
});

it("preview seeds re-pick only their own position", () => {
  const q = plan();
  const reseeded = plan({ existing: q.slice(0, 1), seeds: { 1: 3 } });
  expect(reseeded[0]).toEqual(q[0]);
  expect(reseeded[1].seed).toBe(3);
});

it("locks the whole plan when Plan ahead is on, none when off", () => {
  expect([lockedCount(2, true), lockedCount(3, true), lockedCount(2, false)]).toEqual([2, 3, 0]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/session.test.ts -t "planned ahead"`
Expected: FAIL (`lockedCount` missing; 15/12-player plans have length 0).

- [ ] **Step 3: Implement** the `planQueue` depth change, `seeds`, `lockedCount`; delete `queueDepth`.

- [ ] **Step 4: Run lib tests**

Run: `npx vitest run src/lib/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Mirror the store in the sim and add the depth scenarios**

In `playNight`: `const full = planQueue({ …, existing: queue, enabled: Boolean(scenario.planAhead) }); queue = full.slice(0, lockedCount(full.length, true));` and pass `full` to `courtSuggestions`. The `queue.length === 2` "Then" sampling uses `full`. Update the 12-player planning test's comment ("nobody left to mix, so nothing is locked") to describe the new behaviour; keep its assertions. Add:

```ts
describe("one planned match per court vs today", () => {
  for (const [key, players, courts] of [["12x2", 12, twoCourts], ["15x2", 15, twoCourts], ["16x2", 16, twoCourts], ["8x1", 8, oneCourt]] as const) {
    it(`${key}: no worse than before`, () => {
      const r = summarize({ players, courts: [...courts], planAhead: true }, NIGHTS, false);
      const b = BASELINE[key];
      expect(r.minRatio).toBeGreaterThanOrEqual(b.minRatio);
      expect(r.maxWaitMin).toBeLessThanOrEqual(b.maxWaitMin);
      expect(r.gap).toBeLessThanOrEqual(b.gap);
      expect(r.inARow).toBeLessThanOrEqual(Math.max(2, b.inARow));
    });
  }
});
```

- [ ] **Step 6: Run the sim suite**

Run: `npx vitest run src/lib/matchmaking.sim.test.ts`
Expected: PASS.

- [ ] **Step 7 (only if Step 6 fails on a small group): Fallback**

Change to `lockedCount(depth: number, planAhead: boolean, waiting: number): number` → `!planAhead ? 0 : waiting >= 8 ? depth : Math.min(1, depth)`, where `waiting` = ready pool minus four per idle open court (the figure the old `planQueue` computed before `queueDepth`). Update the Step 1 `lockedCount` test to pass `waiting` (`lockedCount(2, true, 8) === 2`, `lockedCount(2, true, 7) === 1`) and the sim call. Re-run Step 6. If it still fails, stop and report the numbers.

- [ ] **Step 8: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts src/lib/matchmaking.sim.test.ts
git commit -m "feat: plan one match per open court"
```

---

### Task 5: Hard-game rules module

**Files:**
- Create: `src/lib/hardGames.ts`
- Test: `src/lib/hardGames.test.ts`

**Interfaces:**
- Produces (all pure; no imports from `session.ts`, to avoid a cycle):
  - `export const HARD_GAME_AFTER_CARRIES = 2;`
  - `export function isUpper(level: SkillLevel | undefined): boolean` — `"A"` or `"B"`.
  - `export function isHardMatch(m: Pick<Match, "t1" | "t2">, levelOf: (id: string) => SkillLevel | undefined): boolean` — all four upper.
  - `export function carriesSinceHard(players: Player[], matches: Match[]): Map<string, number>` — one entry per **upper** player in `players` (current tier). Walk `matches` in array order: a hard match (any status) resets its four to 0; a **completed** non-hard match adds 1 to each upper player whose partner is C.
  - `export function hardGamePick(args: { pool: Player[]; mustPlay: Player[]; carries: Map<string, number>; enabled: boolean; hardActive: boolean }): { forced: Player[]; candidates: Player[]; due: Player[] } | null` — `pool` is already priority-ordered with back-to-back-limited players removed by the caller. Null unless: `enabled`, `!hardActive`, no C in `mustPlay`, ≥4 upper in `pool`, ≥1 of them with carries ≥ `HARD_GAME_AFTER_CARRIES`. `candidates` = upper players of `pool`; `due` = those at/over the threshold, most carries first, ties in `pool` order; `forced` = upper players of `mustPlay`, then `due`, de-duplicated, first 4.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { Match, Player, SkillLevel } from "../types";
import { makeBlankPlayer } from "./session";
import { HARD_GAME_AFTER_CARRIES, carriesSinceHard, hardGamePick, isHardMatch, isUpper } from "./hardGames";

const P = (id: string, level: SkillLevel, over: Partial<Player> = {}): Player => ({ ...makeBlankPlayer(id, id, level, "ready"), ...over });
const M = (id: string, t1: [string, string], t2: [string, string], status: Match["status"] = "completed"): Match => ({ id, round: 0, num: 1, courtId: "1", status, t1, t2, s1: 21, s2: 15, elapsedAtTick0: 0 });

describe("hard games: definitions", () => {
  const roster = [P("a1", "A"), P("b1", "B"), P("b2", "B"), P("b3", "B"), P("c1", "C"), P("c2", "C")];
  const levelOf = (id: string) => roster.find((p) => p.id === id)?.level;

  it("upper tier is A or B; a hard match has no C", () => {
    expect([isUpper("A"), isUpper("B"), isUpper("C"), isUpper(undefined)]).toEqual([true, true, false, false]);
    expect(isHardMatch(M("m", ["a1", "b1"], ["b2", "b3"]), levelOf)).toBe(true);
    expect(isHardMatch(M("m", ["a1", "c1"], ["b2", "b3"]), levelOf)).toBe(false);
  });

  it("counts carries for upper players only and resets on any hard match", () => {
    const carry1 = M("m1", ["a1", "c1"], ["b1", "c2"]);
    const carry2 = M("m2", ["a1", "c2"], ["b2", "b3"]);
    expect(carriesSinceHard(roster, [carry1]).get("a1")).toBe(1);
    expect(carriesSinceHard(roster, [carry1, carry2]).get("a1")).toBe(HARD_GAME_AFTER_CARRIES);
    expect(carriesSinceHard(roster, [carry1, carry2]).get("b2")).toBe(0); // partnered b3
    expect(carriesSinceHard(roster, [carry1, carry2]).has("c1")).toBe(false);
    expect(carriesSinceHard(roster, [carry1, carry2, M("h", ["a1", "b1"], ["b2", "b3"], "in_progress")]).get("a1")).toBe(0);
    expect(carriesSinceHard(roster, [carry1, M("live", ["a1", "c2"], ["b2", "b3"], "in_progress")]).get("a1")).toBe(1); // not played yet
  });

  it("a deleted player in the history doesn't crash and isn't upper tier", () => {
    expect(isHardMatch(M("m", ["a1", "gone"], ["b2", "b3"]), levelOf)).toBe(false);
    expect(carriesSinceHard(roster, [M("m", ["a1", "gone"], ["b2", "b3"])]).get("a1")).toBe(0);
  });

  it("uses the current tier: a C promoted to B no longer counts as carried", () => {
    const promoted = roster.map((p) => (p.id === "c1" ? { ...p, level: "B" as const } : p));
    expect(carriesSinceHard(promoted, [M("m1", ["a1", "c1"], ["b1", "c2"])]).get("a1")).toBe(0);
  });
});

describe("hard games: when one can be planned", () => {
  const pool = [P("a1", "A"), P("b1", "B"), P("c1", "C"), P("b2", "B"), P("b3", "B"), P("c2", "C")];
  const carries = new Map([["a1", 2], ["b1", 0], ["b2", 3], ["b3", 1]]);
  const base = { pool, mustPlay: [] as Player[], carries, enabled: true, hardActive: false };

  it("picks the due players first, most carries first", () => {
    const pick = hardGamePick(base)!;
    expect(pick.due.map((p) => p.id)).toEqual(["b2", "a1"]);
    expect(pick.forced.map((p) => p.id)).toEqual(["b2", "a1"]);
    expect(pick.candidates.map((p) => p.id)).toEqual(["a1", "b1", "b2", "b3"]);
  });

  it("must-play upper players come before due ones", () => {
    expect(hardGamePick({ ...base, mustPlay: [pool[4]] /* b3 */ })!.forced.map((p) => p.id)).toEqual(["b3", "b2", "a1"]);
  });

  it("never when off, when one is already on, when a C must play, without 4 upper, or nobody due", () => {
    expect(hardGamePick({ ...base, enabled: false })).toBeNull();
    expect(hardGamePick({ ...base, hardActive: true })).toBeNull();
    expect(hardGamePick({ ...base, mustPlay: [pool[2]] })).toBeNull();
    expect(hardGamePick({ ...base, pool: pool.filter((p) => p.id !== "b3") })).toBeNull();
    expect(hardGamePick({ ...base, carries: new Map([["a1", 1], ["b2", 1]]) })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/hardGames.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/hardGames.ts`** with the interfaces above.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/hardGames.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hardGames.ts src/lib/hardGames.test.ts
git commit -m "feat: hard-game rules — carries since the last all-A/B game, when one may be planned"
```

---

### Task 6: Wire hard games into the picker and planner

**Files:**
- Modify: `src/types.ts` (`QueueItem.hard?: boolean`, `Suggestion.hard?: boolean`)
- Modify: `src/lib/session.ts` — `pickFour` (~413), new `mustPlayers`, `SuggestionOptions` + `buildSuggestion` (~441–515), `planQueue`, `courtSuggestions` (~706)
- Test: `src/lib/session.test.ts` (new `describe("hard games")`)

**Interfaces:**
- Consumes: everything from Task 5; `planQueue` `seeds` (Task 4).
- Produces:
  - `const AVOID_AC_PENALTY = 20;` (cost units, same scale as `8 × familiarity`).
  - `function mustPlayers(pool: Player[], extraReady: number): Player[]` — today's must-play selection lifted out of `pickFour` (priority order, `skipped >= mustPlayAfter(pool.length + extraReady)`, first 4).
  - `pickFour(pool, meet, seed = 0, singleCourt = false, extraReady = 0, opts: { forced?: Player[]; avoidAC?: boolean } = {})` — `forced`, when given, replaces the computed must-play group; `avoidAC` adds `AVOID_AC_PENALTY` to any foursome holding both an A and a C.
  - `SuggestionOptions` gains `hardGames?: boolean` and `hardPlanned?: boolean` (a hard game exists outside `matches`, e.g. in the plan).
  - `buildSuggestion` — after the requested-pair branch (which stays first and never flags hard): `hardActive = options.hardPlanned || any in_progress match isHardMatch`; `hardGamePick({ pool: pool without consecutiveGames >= MAX_CONSECUTIVE, mustPlay: mustPlayers(pool, extraReady), carries: carriesSinceHard(players, matches), enabled: !!options.hardGames, hardActive })`. If it returns a pick: `pickFour(pick.candidates, …, { forced: pick.forced })`, `hard: true`, and `balanceNote = "Hard game · " + <due players in the four, joined " & "> + " carried " + <their highest carry count> + " games · " + <today's tier note>`. Otherwise: `pickFour(pool, …, { avoidAC: hardActive })`.
  - `planQueue` args gain `hardGames?: boolean` → passed to `buildSuggestion`; items get `hard: sug.hard`. A kept item is dropped (re-picked) when `kept.hard && !hardGames`.
  - `courtSuggestions(courts, players, matches, requestedPairs, seeds, now, queue = [], hardGames = false)` — fresh picks get `hardGames` and `hardPlanned = queue.some(q => q.hard) || <an earlier court's suggestion this pass was hard>`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("hard games", () => {
  const T = (id: string, level: SkillLevel, over: Partial<Player> = {}): Player => ({ ...makeBlankPlayer(id, id, level, "ready"), ...over });
  // a1 has carried c1 twice (against two players who have since left); everyone else is fresh
  const history = [completed("h1", ["a1", "c1"], ["xb", "xc"], 21, 15), completed("h2", ["a1", "c1"], ["xb", "xc"], 21, 15)];
  const roster = () => [T("a1", "A"), T("a2", "A"), T("b1", "B"), T("b2", "B"), T("c1", "C"), T("c2", "C"), T("c3", "C"), T("c4", "C"), T("xb", "B", { status: "left" }), T("xc", "C", { status: "left" })];
  const four = (s: Suggestion | null) => s!.four.map((p) => p.id).sort();

  it("a due A/B player gets an all-A/B match, noted for the organizer", () => {
    const sug = buildSuggestion(roster(), history, [], [], 0, { hardGames: true })!;
    expect(sug.hard).toBe(true);
    expect(four(sug)).toEqual(["a1", "a2", "b1", "b2"]);
    expect(sug.balanceNote).toMatch(/^Hard game · a1 carried 2 games · Teams balanced by tier/);
  });

  it("Shuffle on a hard game stays a hard game", () => {
    for (const seed of [1, 2, 3]) expect(buildSuggestion(roster(), history, [], [], seed, { hardGames: true })!.hard).toBe(true);
  });

  it("is off when the switch is off", () => {
    expect(buildSuggestion(roster(), history, [], [], 0, {})!.hard).toBeFalsy();
  });

  it("a C at must-play blocks it and plays", () => {
    const players = roster().map((p) => (p.id === "c3" ? { ...p, skipped: 5 } : p));
    const sug = buildSuggestion(players, history, [], [], 0, { hardGames: true })!;
    expect(sug.hard).toBeFalsy();
    expect(four(sug)).toContain("c3");
  });

  it("only one at a time: not while a hard game is on court or planned", () => {
    const players = [...roster(), T("a3", "A"), T("a4", "A"), T("b3", "B"), T("b4", "B")];
    const onCourt: Match = { ...completed("live", ["a3", "a4"], ["b3", "b4"], 0, 0), status: "in_progress" };
    expect(buildSuggestion(players, [...history, onCourt], [], [], 0, { hardGames: true })!.hard).toBeFalsy();
    expect(buildSuggestion(roster(), history, [], [], 0, { hardGames: true, hardPlanned: true })!.hard).toBeFalsy();
  });

  it("needs four A/B players who aren't on their third match in a row", () => {
    const players = roster().map((p) => (p.id === "b2" ? { ...p, consecutiveGames: 2 } : p));
    expect(buildSuggestion(players, history, [], [], 0, { hardGames: true })!.hard).toBeFalsy();
  });

  it("while a hard game is on, the other pick avoids an A with a C", () => {
    const players = [T("a9", "A"), T("b5", "B"), T("b6", "B"), T("c5", "C"), T("c6", "C"), T("c7", "C"), T("h1", "A"), T("h2", "A"), T("h3", "B"), T("h4", "B")];
    const onCourt: Match = { ...completed("live", ["h1", "h2"], ["h3", "h4"], 0, 0), status: "in_progress" };
    const ids = four(buildSuggestion(players, [onCourt], [], [], 0, { hardGames: true }));
    expect(ids.includes("a9") && ids.some((id) => id.startsWith("c"))).toBe(false);
  });

  it("a requested partner pair wins over a due hard game", () => {
    const sug = buildSuggestion(roster(), history, [["a1", "c2"]], [], 0, { hardGames: true })!;
    expect(sug.hard).toBeFalsy();
    expect(sug.team1.map((p) => p.id)).toEqual(["a1", "c2"]);
  });

  it("switching hard games off re-picks a locked planned hard game", () => {
    const courts = [{ id: "1", name: "Court 1" }];
    const now = new Date(2026, 9, 5, 19, 30);
    const q = planQueue({ players: roster(), matches: history, courts, requestedPairs: [], existing: [], now, enabled: true, hardGames: true });
    expect(q[0].hard).toBe(true);
    const off = planQueue({ players: roster(), matches: history, courts, requestedPairs: [], existing: q, now, enabled: true, hardGames: false });
    expect(off[0].hard).toBeFalsy();
  });
});
```

(Add `SkillLevel` and `Suggestion` to the test file's type import.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/session.test.ts -t "hard games"`
Expected: FAIL (`hard` undefined, unknown options).

- [ ] **Step 3: Implement** the interfaces above in `types.ts` and `session.ts`.

- [ ] **Step 4: Run all lib tests including the sim**

Run: `npx vitest run src/lib`
Expected: PASS (sim scenarios don't enable hard games yet, so their numbers are unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/session.ts src/lib/session.test.ts
git commit -m "feat: plan hard games for A/B players who carried twice, never past a due C"
```

---

### Task 7: Store and UI — per-court plan list, Hard games switch

**Files:**
- Modify: `src/lib/persistence.ts` (`PersistedState.hardGames?: boolean`)
- Modify: `src/hooks/useSessionStore.ts` — `AppState` + `initialState` (`hardGames: true`), persist effect (~345) + deps, queue effect (~485), `suggestions` memo (~473), `shuffleQueue` (~727), new `toggleHardGames` next to `togglePlanAhead` (~748), every other `planQueue(` call (pass `hardGames`), remove `upNext` (~1647) and its export, `queueVM` (~1668), `waitingVM.queueTag`, Manage props (~2053)
- Modify: `src/types.viewmodel.ts` (`QueueEntry`; delete `UpNextEntry`)
- Modify: `src/components/tabs/SessionTab.tsx` (queue panel ~79; delete the `upNext` block ~103)
- Modify: `src/components/tabs/ManageTab.tsx` (toggles ~93)

**Interfaces:**
- Consumes: `planQueue` with `seeds` / `hardGames`, `lockedCount` (Task 4, plus its `waiting` arg if Task 4 Step 7 ran), `courtSuggestions(..., queue, hardGames)` (Task 6).
- Produces:
  - `QueueEntry.locked: boolean`; `QueueEntry.onEdit?: () => void` (only for locked entries).
  - Manage props `hardGames: boolean`, `onToggleHardGames: () => void`.

- [ ] **Step 1: Setting and persistence**

`hardGames` in `AppState` (initial `true`) and in `PersistedState` as optional (old saves merge over `initialState`, so missing means on). Add it to the persisted object and the effect's deps. `toggleHardGames`: owner only, flips the flag (no queue clear — `planQueue`'s keep rule re-picks unstarted hard games).

- [ ] **Step 2: One plan, locked prefix, previews**

- Queue effect: `full = planQueue({ …, existing: state.queue, enabled: true, hardGames: state.hardGames })`; store `full.slice(0, lockedCount(full.length, state.planAhead))`.
- New `plan` memo (deps include `state.tick`): the same call with `seeds` built from `state.suggestSeed["plan" + i]` for each position.
- `suggestions` memo passes `plan` and `state.hardGames` to `courtSuggestions`.
- `shuffleQueue(index)`: `index < state.queue.length` → today's behaviour (plus `hardGames`); otherwise bump `suggestSeed["plan" + index]`.
- `queueVM` iterates `plan` (skipping indexes a free court already took): `label` = index 0 → `"Up next · first court to free"`, else `"Then · next court to free"`; `detail` for index ≥ 1 uses `running[index - 1]` (generalising today's index-1 check); `locked = index < state.queue.length`; `onEdit` only when locked.
- `waitingVM.queueTag`: from `plan` — index 0 → `"Up next"`, any later → `"Then"`.
- Delete `upNext`, `UpNextEntry`, and `rerollSuggestion("upnext")` usage.

- [ ] **Step 3: Session tab**

Queue panel heading: `{q.label}{!q.locked && " · may change"}`; render the Edit button only when `q.onEdit`. Remove the "Next Up · all courts busy" block.

- [ ] **Step 4: Manage tab copy**

Plan-ahead toggle: title **"Lock planned matches"**, hint **"One planned match per court, started exactly as shown. Off: the same list as a preview that keeps updating."** New toggle under it: title **"Hard games"**, hint **"A/B players who have carried a C partner twice get an all-A/B match — never while a C is overdue."**

- [ ] **Step 5: Type-check, test, lint**

Run: `npm run build && npm test && npm run lint`
Expected: build succeeds, all tests PASS, no lint errors.

- [ ] **Step 6: Check it in the app**

`preview_start`, seed 15 players (3A/5B/7C) and 2 courts. Verify: two planned entries while both courts play; "Then" includes Court 1 players when it has played longest; with Plan ahead off both show "· may change" and no Edit; Shuffle on each works; after giving an A/B two C partners via Edit + save, a planned entry shows "Hard game · … carried 2 games" and the other court's match has no A with a C; the Player view (share link) doesn't show the hard-game note; toggling Hard games off re-picks the planned hard game.

- [ ] **Step 7: Commit**

```bash
git add src/lib/persistence.ts src/hooks/useSessionStore.ts src/types.viewmodel.ts src/components/tabs/SessionTab.tsx src/components/tabs/ManageTab.tsx
git commit -m "feat: one planned match per court in the Session tab; Hard games switch in Manage"
```

---

### Task 8: Simulate hard-game nights

**Files:**
- Modify: `src/lib/matchmaking.sim.test.ts` (`Scenario`, `Night`, `playNight`, `summarize`, new describe)

**Interfaces:**
- Consumes: `Scenario.levels` (Task 1); `planQueue` / `courtSuggestions` `hardGames` (Task 6); `isHardMatch`, `carriesSinceHard` (Task 5).
- Produces: `Scenario.hardGames?: boolean`; `Night` / `summarize` fields `hardPerUpper` (avg hard games per A/B player), `maxCarries` (worst carries any A/B player reached before a hard game), `maxWaitC` (worst `skipped` of a C at the moment they start).

- [ ] **Step 1: Write the failing tests**

```ts
describe("hard games on a 3A/5B/7C night", () => {
  for (const [label, courts] of [["2 courts", twoCourts], ["1 court", oneCourt]] as const) {
    it(`${label}: every A/B gets hard games, Cs wait no longer`, () => {
      const night = { players: 15, courts: [...courts], levels: [3, 5, 7] as [number, number, number], planAhead: true };
      const off = summarize(night, NIGHTS, false);
      const on = summarize({ ...night, hardGames: true }, NIGHTS, false);
      expect(on.hardPerUpper).toBeGreaterThanOrEqual(1);
      expect(on.maxCarries).toBeLessThanOrEqual(3);
      expect(on.maxWaitC).toBeLessThanOrEqual(off.maxWaitC + 1);
      expect(on.wait).toBeLessThanOrEqual(ceilQuarter(15) + 1);
      expect(on.inARow).toBeLessThanOrEqual(2);
      expect(on.gap).toBeLessThanOrEqual(off.gap + 1);
    });
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/matchmaking.sim.test.ts -t "hard games"`
Expected: FAIL (`hardPerUpper` undefined).

- [ ] **Step 3: Implement the metrics**

Pass `scenario.hardGames` to `planQueue` and `courtSuggestions`. After the night: `hardPerUpper` = hard matches' upper-player appearances ÷ number of upper players. `maxCarries`: before each match start, take `Math.max(...carriesSinceHard(players, matches).values())`. `maxWaitC`: at each start, the highest `skipped` among the C players in the starting four.

- [ ] **Step 4: Run the sim suite**

Run: `npx vitest run src/lib/matchmaking.sim.test.ts`
Expected: PASS. If `maxCarries` or `maxWaitC` fails, stop and report the numbers — don't loosen the targets.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchmaking.sim.test.ts
git commit -m "test: simulate hard-game nights — A/B get them, Cs wait no longer"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full checks**

Run: `npm run build && npm test && npm run lint`
Expected: all succeed.

- [ ] **Step 2: Run a whole session in the browser**

`preview_start`; 15 players (3A/5B/7C), 2 courts. Check in eight one at a time (round 1 follows that order), play about six matches through Start / save, and confirm: per-court plan list, minutes on waiting rows, at least one hard game appears once an A/B has two carries, no C overdue while it does. Screenshot the Session tab with a hard game planned.

- [ ] **Step 3: Request review** with superpowers:requesting-code-review on the branch.
