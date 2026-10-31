# SmashMatch 9/10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every player can tell from their own phone when they play, with whom, and why. Small groups on one court get real variety. Umpire access can't be guessed, and the scorekeeper shows who serves.

**Architecture:** New decisions go in small pure modules under `src/lib/`, each with its own test: `youStatus.ts`, `queueReasons.ts`, `tierCheck.ts`, `pin.ts` and `serve.ts`. `useSessionStore` wires each one into a view model, and the components only render what they are given. Matchmaking changes stay inside `session.ts` (`pickFour`, `pickBalancedFoursome`, `pairCounts`), and the whole-evening sims in `matchmaking.sim.test.ts` guard them. Each phase ends in a shippable state.

**Tech Stack:** React 18 + TypeScript, Vite 5, Vitest 2 (`npm test`), Firebase Realtime Database + anonymous auth. Task 15 adds Playwright and the Firebase emulator.

**Spec:** `docs/superpowers/specs/2026-10-31-smashmatch-9-of-10-review.md` (task numbers 1.1–4.4 there map to Tasks 1–16 here; see the table below).

| Spec | Task | Spec | Task | Spec | Task | Spec | Task |
|---|---|---|---|---|---|---|---|
| 1.1 | 1 | 2.1 | 6 | 3.3 | 10 | 4.1 | 13 |
| 1.2 | 2 | 2.2 | 7 | 3.2 | 11 | 4.2 | 14 |
| 1.3 | 3 | 2.3 | 8 | 3.1 | 12 | 4.3 | 15 |
| 1.4 | 4 | 2.4 | 9 | | | 4.4 | 16 |
| 1.5 | 5 | | | | | | |

Phase 3 runs 3.3 → 3.2 → 3.1. The variety change (3.1) has to be measured with the stable, extended sim that 3.3 and 3.2 build.

## Decisions this plan makes where the spec can't be met as written

1. **6 players on 1 court can't get "a new group in ≥ 60% of matches" while nobody plays 3 in a row.** Proof: 4 play and 2 sit, so a 3-match window has 6 sit-out places for 6 players. "Never 3 in a row" means everyone sits at least once in every 3-match window, so everyone sits exactly once. Then whoever sits at match *k* also sits at match *k*+3, the sit-out pairs repeat every 3 matches, and so do the foursomes. Only 3 groups are possible, which is the 27% measured. 5 players on 1 court have only 5 possible foursomes, so their ceiling is about 50%. **The plan keeps "never 3 in a row" (a listed strength). For 5–6 players it measures variety as a *new matchup*: the same four split into different teams counts as new.** Targets: matchup ratio ≥ 0.6 on the worst night and ≥ 3 partners each. For 7–9 players the spec's own "new group ≥ 60%" stands. If you would rather allow an occasional third match in a row for 6 players, say so before Task 12.
2. **Spec 3.3 ("same result at 20 and 60 evenings"):** the sim already uses a fixed seed. Worst-night numbers still change with the number of nights, so the asserting suite always runs 60 nights. `SIM_NIGHTS` only feeds a report that prints and asserts nothing.
3. **Spec 2.1:** the PIN at `sessions/{id}/pin` is write-once today, and "New session" keeps the PIN. The rules will let the **owner** replace it, and the app upgrades a 4-digit PIN to 6 digits when the host starts a new session, never mid-session. The join screen accepts 4 or 6 digits so sessions running at deploy time keep working.
4. **Spec 1.5:** the roster moves to the top of Manage (0 taps), followed by the walk-in form. There is no jump link.
5. **Spec 2.2 ("flagged within 3 matches"):** three results are too noisy to catch every mis-tiered player without also flagging correctly tiered ones. Task 7 measures it as a rate: flagged after 3 matches on ≥ 50% of nights and after 5 on ≥ 70%, with ≤ 10% false flags.
6. **Spec 4.3:** the repo has no CI and no Playwright. Task 11 adds a CI workflow (lint, unit tests, build) and Task 15 adds the end-to-end job against the Firebase emulator, so nothing touches the live database.

## Global Constraints

- Matchmaking stays deterministic: no `Math.random()` or `Date.now()` inside `src/lib` picking or reason code. Time comes in as a parameter. The host's, umpire's and watcher's devices must compute the same plan and the same reasons.
- Every shown string lives in `src/lib/copy.ts` and passes `copy.test.ts`: "match", never "game"; "umpire", never "organizer"; en dashes, never ` - ` or `—`; short labels in sentence case.
- Tiers never reach a watcher: anything tier-specific is hidden when `hideTiers` (remote role "player") is set.
- Component text is never smaller than 14px, and row pills keep at least 8px gaps (`src/styles.test.ts`). Every tap target is at least 44px.
- Firebase rejects `undefined` values: optional fields are set only when present, as in `planQueue`'s `...(sug.hard ? { hard: true } : {})`.
- The PIN never goes into the world-readable `sessions/{id}/data` blob.
- Do not loosen any existing simulation threshold. If one fails, stop and report the numbers.
- No new dependencies, except `@playwright/test` and `firebase-tools` (devDependencies) in Task 15.
- Baseline on 31 Oct 2026 (`56966aa`): 311 tests pass in about 6.5 minutes (sims are most of it), and `npm run lint` is clean. During a task, run only the named test files. Run the full `npm test`, `npm run lint` and `npm run build` at the end of each phase.
- Component tests render to static HTML with `react-dom/server`, which ships with `react-dom`, and assert on text through `renderText` (Task 2). They never assert class names.

## Review Focus

1. **A watcher picks their name, but they have left or are resting**, or the session has ended. Their status is "resting" or nothing, never a stale position or a crash. Test: Task 1.
2. **A session started before the PIN change still has a 4-digit PIN.** An umpire can still join with 4 digits, and the host's PIN changes only when they start a new session. Tests: Task 6.
3. **The scorekeeper opens on a match already under way, after a reload, or after a score was typed by hand.** The server is unknown, so the sheet asks "Who serves?" instead of guessing. Test: Task 13.
4. **The umpire edited or shuffled the next match, then someone was passed over.** The reason says the umpire set it, not a made-up balancing reason. Test: Task 8.
5. **The join link opens with the network down, the session missing, or the default name "New session".** The join screen falls back to "Join session" and still works. Test: Task 3.

---

## Phase 1 · Quick wins

### Task 1: Honest "You're Nth in line" (spec 1.1, F1)

**Files:**
- Create: `src/lib/youStatus.ts`
- Test: `src/lib/youStatus.test.ts`
- Modify: `src/lib/copy.ts` (`session` block, lines ~80–100), `src/lib/copy.test.ts`
- Modify: `src/components/tabs/SessionTab.tsx` (`ordinal` lines 22–26, `yourStatus` lines 70–83, row tag lines 326–331)
- Modify: `src/hooks/useSessionStore.ts` (`session:` VM: new `plannedIds`)

**Interfaces:**
- Produces:
  - `ordinal(n: number): string`, moved here from `SessionTab.tsx` ("1st", "11th", "22nd").
  - `interface YouStatusInput { waitingIds: string[]; plannedIds: string[][]; playingCourt: string | null; resting: boolean; ended: boolean; reason?: string }`. `waitingIds` is the queue order shown (`waitingVM`), and `plannedIds[k]` holds the four ids of plan item *k* (0 = Up next).
  - `youStatus(youId: string, input: YouStatusInput): string | null`
  - Copy: `session.youInNext = "You're in the next match"`, `session.youInMatchAfter = "You're in the match after"`, `session.youPassed(ordinal: string, reason: string) => \`You're ${ordinal} in line · ${reason}\``, `session.passedGeneric = "not in the next match – picks also mix groups and even out teams"`. `session.position(index)` becomes just `` `#${index + 1}` ``.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/youStatus.test.ts
const base = { waitingIds: ["a", "b", "c", "d", "e", "f"], plannedIds: [] as string[][], playingCourt: null, resting: false, ended: false };
it("on court wins over everything", () => expect(youStatus("d", { ...base, playingCourt: "Court 1", resting: true })).toBe("You're playing on Court 1"));
it("in Up next", () => expect(youStatus("d", { ...base, plannedIds: [["d", "e", "f", "a"]] })).toBe("You're in the next match"));
it("in Then", () => expect(youStatus("d", { ...base, plannedIds: [["a", "b", "c", "e"], ["d", "f", "x", "y"]] })).toBe("You're in the match after"));
it("passed over: someone below is planned", () =>
  expect(youStatus("d", { ...base, plannedIds: [["a", "b", "c", "f"]] })).toBe("You're 4th in line · not in the next match – picks also mix groups and even out teams"));
it("passed over uses the reason when given", () =>
  expect(youStatus("d", { ...base, plannedIds: [["a", "b", "c", "f"]], reason: "Balancing teams" })).toBe("You're 4th in line · Balancing teams"));
it("4th with nobody below planned", () => expect(youStatus("d", { ...base, plannedIds: [["a", "b", "c", "x"]] })).toBe("You're 4th in line"));
it("first with no plan", () => expect(youStatus("a", base)).toBe("You're next in line"));
it("resting", () => expect(youStatus("z", { ...base, resting: true })).toBe("You're resting"));
it("left: not waiting, not resting", () => expect(youStatus("z", base)).toBeNull());
it("ended", () => expect(youStatus("d", { ...base, ended: true })).toBeNull());
it("ordinals", () => expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd"]));
```

Add to `copy.test.ts` "shows the strings the brief asks for": `expect(copy.session.position(0)).toBe("#1")`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/youStatus.test.ts src/lib/copy.test.ts`
Expected: FAIL (`youStatus` not defined; `position(0)` is `"#1 · Next up"`).

- [ ] **Step 3: Implement `youStatus` and the copy changes**

Order of rules: playing → ended (null) → in `plannedIds[0]` → in any later item → waiting (passed over if any id after theirs in `waitingIds` is in any planned item, using `reason ?? passedGeneric`; else index 0 → `youNext`, otherwise `youPosition`) → resting → null.

- [ ] **Step 4: Use it in `SessionTab.tsx`**

`yourStatus` calls `youStatus(you.id, …)`, with `waitingIds` from `waitingVM` and `plannedIds` from `queueVM`. A watcher's `queueVM` is the same plan: build `plannedIds` from the store's `plan`, passed as a new `SessionStore["session"]` field `plannedIds: string[][]`. `resting` comes from `notInRotationVM`. The row tag shows on **every** row with `w.queueTag`: drop the `(i > 0 || …)` condition, since `#1` no longer says "Next up".

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/youStatus.test.ts src/lib/copy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/youStatus.ts src/lib/youStatus.test.ts src/lib/copy.ts src/lib/copy.test.ts src/components/tabs/SessionTab.tsx src/hooks/useSessionStore.ts
git commit -m "feat: queue position says when someone below you plays first"
```

---

### Task 2: The watcher's court card shows the planned match (spec 1.2, F2)

**Files:**
- Create: `src/test/renderText.ts`
- Test: `src/components/CourtCard.test.tsx`
- Modify: `src/types.viewmodel.ts` (`CourtViewModel.suggestion`, ~line 94), `src/hooks/useSessionStore.ts` (court suggestion VM, ~line 1822), `src/components/CourtCard.tsx` (line 101), `src/components/CourtCard.module.css`, `src/lib/copy.ts` (`court`)

**Interfaces:**
- Produces:
  - `renderText(el: ReactElement): string`: `renderToStaticMarkup`, then tags become spaces, `&amp; &lt; &gt; &quot; &#x27;` are decoded, and whitespace collapses to single spaces. Every later component test uses it.
  - `CourtViewModel.suggestion.locked: boolean`, set to `suggestion.queueIndex !== undefined && suggestion.queueIndex < state.queue.length` (the same rule as `queueVM`'s `locked`).
  - `copy.court.upNext = "Up next"`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/CourtCard.test.tsx — `court(overrides)` builds an available CourtViewModel with
// suggestion { team1Label: "Ana & Budi", team2Label: "Citra & Dewi", reason: "Teams balanced by tier (A+C vs B+B)", locked: true, onStart() {}, onRegenerate() {} }
it("watcher sees who plays next on an open court, without buttons or tiers", () => {
  const text = renderText(<CourtCard court={court()} readOnly />);
  expect(text).toContain("Up next");
  expect(text).toContain("Ana & Budi vs Citra & Dewi");
  expect(text).not.toContain("Start match");
  expect(text).not.toContain("Tier");
  expect(text).not.toContain("may change");
});
it("an unlocked plan says it may change", () => {
  expect(renderText(<CourtCard court={court({ locked: false })} readOnly />)).toContain("Up next · may change");
});
it("the umpire's card is unchanged", () => {
  expect(renderText(<CourtCard court={court()} />)).toContain("Start match");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/CourtCard.test.tsx`
Expected: FAIL on "Up next". If the run errors on the `.module.css` import instead, add `test: { css: { modules: { classNameStrategy: "non-scoped" } } }` to `vite.config.ts` and run again.

- [ ] **Step 3: Implement**

In `CourtCard`'s available branch, a read-only card with a suggestion shows an `upNextLabel` line (`copy.court.upNext`, plus `` ` · ${copy.session.mayChange}` `` when not locked) and the two team labels, with no reason and no buttons. Add `.upNextLabel` to the CSS module at 14px or larger. Set `locked` in the store.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/components/CourtCard.test.tsx src/styles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test/renderText.ts src/components/CourtCard.test.tsx src/components/CourtCard.tsx src/components/CourtCard.module.css src/types.viewmodel.ts src/hooks/useSessionStore.ts src/lib/copy.ts vite.config.ts
git commit -m "feat: watchers see the planned match on an open court"
```

---

### Task 3: The join screen names the session (spec 1.3, F9)

**Files:**
- Modify: `src/lib/firebaseSync.ts` (new export), `src/hooks/useSessionStore.ts` (remote block ~lines 224–342 and `remote:` VM ~line 2188), `src/components/RemoteGate.tsx`, `src/lib/copy.ts` (`gate`)
- Test: `src/components/RemoteGate.test.tsx`

**Interfaces:**
- Produces:
  - `fetchSessionLabel(sessionId: string): Promise<{ name: string; schedule: string } | null>`: one-shot `get()` of `sessions/{id}/data/sessionName` and `…/sessionSchedule`, allowed by `.read: true` on `data`. It resolves `null` when Firebase isn't configured, the name is missing, or the read throws.
  - `SessionStore["remote"].sessionLabel: { name: string; schedule: string } | null`, fetched once on mount in remote mode, before a role is chosen.
  - `copy.gate.joinNamed(name: string) => \`Join ${name}\``. `copy.gate.joinTitle` stays "Join session" as the fallback.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/RemoteGate.test.tsx — `props(overrides)` gives role null, roleStep "choose", firebaseConfigured true, no-op callbacks
it("names the session and its time", () => {
  const text = renderText(<RemoteGate {...props({ sessionLabel: { name: "GoBadmin", schedule: "Wed 19:00–22:00" } })} />);
  expect(text).toContain("Join GoBadmin");
  expect(text).toContain("Wed 19:00–22:00");
});
it("falls back when the label is missing or the default name", () => {
  expect(renderText(<RemoteGate {...props({ sessionLabel: null })} />)).toContain("Join session");
  expect(renderText(<RemoteGate {...props({ sessionLabel: { name: "New session", schedule: "" } })} />)).toContain("Join session");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/RemoteGate.test.tsx`
Expected: FAIL (no "Join GoBadmin").

- [ ] **Step 3: Implement**

Title: `joinNamed(name)` when the trimmed name is non-empty and not `copy.defaultSessionName`, otherwise `joinTitle`. When there is a schedule, it goes on its own line under the title. A fetch error is never shown: the screen just keeps the fallback.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/components/RemoteGate.test.tsx src/lib/copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebaseSync.ts src/hooks/useSessionStore.ts src/components/RemoteGate.tsx src/components/RemoteGate.test.tsx src/lib/copy.ts
git commit -m "feat: join screen names the session and its time"
```

---

### Task 4: Every input has a label (spec 1.4, F10)

**Files:**
- Modify: `src/components/RemoteGate.tsx` (PIN input, line 45), `src/components/tabs/ManageTab.tsx` (time input line 116, partner selects lines 167 and 175), `src/components/modals/ScorekeeperSheet.tsx` (score inputs lines 73 and 83), plus any other input found in Step 1, `src/lib/copy.ts`

**Interfaces:**
- Produces: `copy.gate.pinLabel = "Umpire PIN"` and `copy.scorekeeper.scoreFor(team: string) => \`Score for ${team}\``. The closing-time input uses `copy.manage.courtCloses(name)` and the partner selects use `copy.manage.playerA` / `playerB`.

- [ ] **Step 1: List every form control**

Run: `git grep -n -E "<(input|select|textarea)" -- src/components`
Expected: about 15 hits. For each one, note whether it has an `aria-label`, an `id` that a `<label htmlFor>` points at, or a wrapping `<label>` with text.

- [ ] **Step 2: Add `aria-label` to each control without one,** including the five named in **Files**. A control inside a `<label>` with text (the closing time) gets one anyway, as the spec asks.

- [ ] **Step 3: Check in the browser**

Start the preview (`npm run dev` through `preview_start`). On each of Session, Manage (with a court that has a closing time), the scorekeeper sheet, the setup wizard, and `/?view=x` → Umpire, run:

```js
[...document.querySelectorAll("input,select,textarea")].filter((el) => el.labels.length === 0 && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")).map((el) => el.outerHTML.slice(0, 80))
```

Expected: `[]` on every screen.

- [ ] **Step 4: Run the copy tests**

Run: `npx vitest run src/lib/copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components src/lib/copy.ts
git commit -m "fix: every input and select has a screen-reader label"
```

---

### Task 5: Roster first on Manage (spec 1.5, F7)

**Files:**
- Modify: `src/components/tabs/ManageTab.tsx` (panel order, lines 58–313)
- Test: `src/components/tabs/ManageTab.test.tsx`

**Interfaces:**
- Produces: the panel order is Title → Roster → Add a walk-in player → Partner requests → Courts → Live sharing → Session. Props are unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/tabs/ManageTab.test.tsx — `props(overrides)` builds SessionStore["manage"] with isOwner true,
// shareEnabled true, two players in managePlayersVM, no-op callbacks
it("puts the roster first, the danger zone last", () => {
  const text = renderText(<ManageTab {...props()} />);
  const at = (s: string) => text.indexOf(s);
  expect(at("Roster (2)")).toBeGreaterThan(-1);
  expect(at("Roster (2)")).toBeLessThan(at("Add a walk-in player"));
  expect(at("Add a walk-in player")).toBeLessThan(at("Partner requests"));
  expect(at("Partner requests")).toBeLessThan(at("Courts"));
  expect(at("Courts")).toBeLessThan(at("Live sharing"));
  expect(at("Live sharing")).toBeLessThan(at("End & see results"));
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/tabs/ManageTab.test.tsx`
Expected: FAIL (the roster comes after "Partner requests").

- [ ] **Step 3: Move the JSX blocks into that order.** Change nothing inside them.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/components/tabs/ManageTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tabs/ManageTab.tsx src/components/tabs/ManageTab.test.tsx
git commit -m "fix: roster is the first thing on Manage"
```

- [ ] **Step 6: End of phase**

Run `npm test`, `npm run lint` and `npm run build` (expect all green, and 311 tests plus the new ones). In the preview at 375×667, take one screenshot each of: a watcher's Session tab with an open court, Manage, and the join screen. Then use superpowers:finishing-a-development-branch.

---

## Phase 2 · Fairness and trust

### Task 6: 6-digit PIN and a guess limit (spec 2.1, F5)

**Files:**
- Create: `src/lib/pin.ts`, `src/lib/pin.test.ts`
- Modify: `src/lib/firebaseSync.ts` (drop `generateSessionPin`, rewrite `claimUmpireAccess`), `database.rules.json`, `src/hooks/useSessionStore.ts` (import line 4; `submitUmpirePin` lines 306–318; the wizard's Start session handler, the `setState` near line 1646), `src/components/RemoteGate.tsx` (lines 45–56), `src/lib/copy.ts` (`gate`)

**Interfaces:**
- Produces (`src/lib/pin.ts`, no Firebase import):
  - `export const PIN_DIGITS = 6; export const MAX_PIN_TRIES = 5; export const PIN_LOCK_MS = 600_000;`
  - `generateSessionPin(): string`: six digits from `crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000`, zero-padded.
  - `isPinLength(pin: string): boolean`: true for 4 or 6 digits.
  - `nextAttempt(prev: { count: number; at: number } | null, nowMs: number): number`: 1 when there is no `prev` or `nowMs - prev.at >= PIN_LOCK_MS`, otherwise `prev.count + 1`.
- Produces (`firebaseSync.ts`): `type UmpireClaimResult = "ok" | "wrong-pin" | "locked" | "unavailable"`. `claimUmpireAccess` first reads `sessions/{id}/attempts/{uid}`, then writes `{ count: nextAttempt(prev, Date.now()), at: serverTimestamp(), guess: pin }`. If that write is rejected (clock skew), it retries once with the other count (1, or `prev.count + 1`). It returns `"locked"` without claiming when the count is over `MAX_PIN_TRIES`, and otherwise writes `editorClaims/{uid}` as today.
- Copy: `gate.pinPlaceholder = "PIN"`, `gate.locked = "Too many tries. Wait 10 minutes, then try again."`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pin.test.ts
it("makes 6-digit PINs without Math.random", () => {
  const spy = vi.spyOn(Math, "random");
  const pins = Array.from({ length: 200 }, generateSessionPin);
  expect(pins.every((p) => /^\d{6}$/.test(p))).toBe(true);
  expect(new Set(pins).size).toBeGreaterThan(150);
  expect(spy).not.toHaveBeenCalled();
});
it("accepts 4 (sessions from before) or 6 digits", () => {
  expect(["1234", "123456", "12345", "", "1234567"].map(isPinLength)).toEqual([true, true, false, false, false]);
});
it("counts tries in a 10-minute window", () => {
  const t = 10_000_000;
  expect(nextAttempt(null, t)).toBe(1);
  expect(nextAttempt({ count: 3, at: t - 1000 }, t)).toBe(4);
  expect(nextAttempt({ count: 5, at: t - 599_999 }, t)).toBe(6);
  expect(nextAttempt({ count: 5, at: t - 600_000 }, t)).toBe(1);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/pin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/pin.ts`** and point the store's import of `generateSessionPin` at it.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run src/lib/pin.test.ts`
Expected: PASS.

- [ ] **Step 5: Change the rules.** These lines are exact:

```json
"pin": {
  ".write": "!data.exists() || auth.uid === root.child('sessions').child($sessionId).child('ownerUid').val()",
  ".validate": "newData.isString() && newData.val().matches(/^([0-9]{4}|[0-9]{6})$/)"
},
"attempts": {
  "$uid": {
    ".write": "auth.uid === $uid",
    ".validate": "newData.hasChildren(['count', 'at', 'guess']) && newData.child('at').val() === now && newData.child('count').val() === ((!data.exists() || data.child('at').val() <= now - 600000) ? 1 : data.child('count').val() + 1)"
  }
},
"editorClaims": {
  "$uid": {
    ".write": "auth.uid === $uid",
    ".validate": "newData.val() === root.child('sessions').child($sessionId).child('pin').val() && newData.val() === root.child('sessions').child($sessionId).child('attempts').child($uid).child('guess').val() && root.child('sessions').child($sessionId).child('attempts').child($uid).child('count').val() <= 5"
  }
}
```

Every claim must match a guess that was counted, so each new guess costs a try. Known limit: a "device" is an anonymous auth uid, and clearing site data gets a new one. Firebase's per-IP limit on anonymous sign-ups is what slows that down.

- [ ] **Step 6: Wire the store and the gate**

`submitUmpirePin` maps `"locked"` to `copy.gate.locked`. The gate input gets `maxLength={6}`, and its button is enabled when `isPinLength(pin) && !checking`. In the wizard's Start session handler, if `state.sessionPin.length === 4`, generate a new PIN, `saveIdentity({ sessionId, sessionPin })` and set `sessionPin`. The ownership effect (line 293) pushes it, which the new rules allow for the owner.

- [ ] **Step 7: Hand-off: rules go live before the app.** Ask the user to paste `database.rules.json` into Firebase Console → Realtime Database → Rules, and to check these in the Rules Playground (authenticated, uid `u1`) before publishing:

| Simulated write | Expected |
|---|---|
| `attempts/u1` = `{count:1, at:now, guess:"123456"}` with no prior data | allowed |
| `attempts/u1` = `{count:1, …}` when the stored count is 3, `at` 1 min ago | denied |
| `editorClaims/u1` = the right PIN when `attempts/u1.guess` is a different value | denied |
| `editorClaims/u1` = the right PIN with `attempts/u1` `{count:6, guess: right PIN}` | denied |

Clients from before this change can't claim umpire access under the new rules until they reload. That is acceptable.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pin.ts src/lib/pin.test.ts src/lib/firebaseSync.ts database.rules.json src/hooks/useSessionStore.ts src/components/RemoteGate.tsx src/lib/copy.ts
git commit -m "feat: 6-digit umpire PIN, 5 tries per device then a 10-minute lock"
```

---

### Task 7: Tier check: flag a mis-tiered player (spec 2.2, F4)

**Files:**
- Create: `src/lib/tierCheck.ts`, `src/lib/tierCheck.test.ts`
- Modify: `src/lib/rankings.sim.test.ts` (new `describe`), `src/types.viewmodel.ts` (`ManagePlayerEntry`), `src/hooks/useSessionStore.ts` (`managePlayersVM`, ~line 1950), `src/components/tabs/ManageTab.tsx` (roster row), `src/components/tabs/ManageTab.module.css`, `src/lib/copy.ts` (`manage`)
- Test: `src/components/tabs/ManageTab.test.tsx`

**Interfaces:**
- Produces:
  - `export const TIER_HINT_MIN_GAMES = 3; export const TIER_HINT_UP = 65; export const TIER_HINT_DOWN = 35;` (the bounds are settled in Step 4).
  - `tierHint(p: Pick<Player, "level" | "perf" | "rankGames">): SkillLevel | null`: the adjacent tier when `rankGames >= TIER_HINT_MIN_GAMES` and `scoreLabel(p) >= TIER_HINT_UP` (one up) or `<= TIER_HINT_DOWN` (one down). Null at the top or bottom tier.
  - `ManagePlayerEntry.tierHint: { level: SkillLevel; onAccept: () => void } | null`. It is non-null only when this device is the owner. `onAccept` calls `updatePlayer(id, name, level, isHost, inRankings)`.
  - Copy: `manage.tierHint(name: string, level: string) => \`${name} may be tier ${level}\``, `manage.makeTier(level: string) => \`Make tier ${level}\``, `manage.notNow = "Not now"`.

- [ ] **Step 1: Write the failing unit tests**

```ts
// src/lib/tierCheck.test.ts — perf ±0.75 over 3 games scores 65 / 35
const p = (level: SkillLevel, perf: number, rankGames = 3) => ({ level, perf, rankGames });
it("waits for 3 matches", () => expect(tierHint(p("C", 2, 2))).toBeNull());
it("suggests one tier up", () => expect(tierHint(p("C", 0.75))).toBe("B"));
it("suggests one tier down", () => expect(tierHint(p("B", -0.75))).toBe("C"));
it("as expected: nothing", () => expect(tierHint(p("B", 0))).toBeNull());
it("no tier above A or below D", () => {
  expect(tierHint(p("A", 2))).toBeNull();
  expect(tierHint(p("D", -2))).toBeNull();
});
```

- [ ] **Step 2: Run them, confirm they fail, implement `tierCheck.ts`, run again and confirm they pass**

Run: `npx vitest run src/lib/tierCheck.test.ts`

If Step 4 changes the bounds, move the ±0.75 fixtures so they still sit exactly on the chosen bounds. For 3 games, perf = (bound − 50) / 100 × 5.

- [ ] **Step 3: Add the calibration sim to `rankings.sim.test.ts`**

`tierCheckNight(r, rounds)`: 12 players on 3 courts, with tiers and skills drawn as in `night()`. Player `p0` is listed as **C** but draws its true skill as **B** (`BASE.B + gauss * 0.5`). Every round, everyone plays (the same pairing as `night()`). After 3 and after 5 rounds it records whether `tierHint(p0) === "B"`, and how many of the other 11 have any hint. `describe("tier check")` averages 300 nights from `rng(9000 + t)` and asserts:
  - `p0` is flagged after 3 matches on ≥ 50% of nights, and after 5 on ≥ 70%;
  - correctly tiered players are flagged after 5 matches ≤ 10% of the time.

- [ ] **Step 4: Settle the bounds**

Try (UP, DOWN) = (60, 40), (65, 35), (70, 30). Keep the pair with the lowest false-flag rate that meets both detection floors. Write the three measured rows in a comment above the `describe`, the way `rankings.sim.test.ts` records its numbers. If no pair meets the floors, stop and report the table.

Run: `npx vitest run src/lib/rankings.sim.test.ts`
Expected: PASS with the chosen pair.

- [ ] **Step 5: Write the failing UI test** in `ManageTab.test.tsx`: an entry with `tierHint: { level: "A", onAccept }` and the name "Fery" shows "Fery may be tier A" and "Make tier A" when `isOwner`, and neither when `isOwner` is false.

- [ ] **Step 6: Implement the row hint**

Put the hint line under the status, with "Make tier A" and "Not now" pill buttons. "Not now" hides it on this device for that player and suggested tier (`ManageTab` state keyed `` `${id}:${level}` ``). Accepting changes the tier. Past matches are then measured against the new tier, so the score moves back toward 50 and the hint goes away on its own.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run src/components/tabs/ManageTab.test.tsx src/lib/tierCheck.test.ts src/lib/copy.test.ts src/styles.test.ts`

- [ ] **Step 8: Commit**

```bash
git add src/lib/tierCheck.ts src/lib/tierCheck.test.ts src/lib/rankings.sim.test.ts src/types.viewmodel.ts src/hooks/useSessionStore.ts src/components/tabs src/lib/copy.ts
git commit -m "feat: host sees a one-tap tier suggestion for a player far from 50 after 3 matches"
```

---

### Task 8: A reason on every passed-over queue row (spec 2.3, F1)

**Files:**
- Modify: `src/lib/session.ts`: extract `groupCost` from `pickFour` (lines 557–567); export `MAX_CONSECUTIVE`
- Create: `src/lib/queueReasons.ts`, `src/lib/queueReasons.test.ts`
- Modify: `src/types.viewmodel.ts` (`WaitingEntry.reason`), `src/hooks/useSessionStore.ts` (`waitingVM` ~line 1970), `src/components/tabs/SessionTab.tsx` (row and `youStatus` input), `src/components/tabs/SessionTab.module.css`, `src/lib/copy.ts` (`session.why`)

**Interfaces:**
- Consumes: `youStatus(..., { reason })` from Task 1.
- Produces:
  - `groupCost(four: Player[], meet: Map<string, number>, minGames: number, waitWeight: number, avoidAC?: boolean): { cost: number; familiarity: number; spread: number }`. `cost` is exactly what `pickFour` computes today, and `pickFour` calls this function. `spread = Σ (games − minGames)`.
  - `type QueueReason = "next" | "after" | "streak" | "host" | "request" | "relief" | "manual" | "mix" | "fair" | "balance" | "courtMix"`
  - `queueReasons(args: { ordered: Player[]; plan: QueueItem[]; matches: Match[]; requestedPairs: [string, string][]; holdingHosts: boolean; singleCourt: boolean }): Map<string, QueueReason | null>`
  - Copy `session.why`: `next: "Plays next"`, `after: "Plays in the match after"`, `streak: "Played 2 in a row · sits one out"`, `host: copy.session.hostLater`, `request: "A partner request comes first"`, `relief: "A hard match is planned"`, `manual: "The umpire set the next match"`, `mix: "Mixing groups · avoids a repeat"`, `fair: "Others have played fewer matches"`, `balance: "Balancing teams"`, `courtMix: "Next match mixes in players coming off court"`.
  - `WaitingEntry.reason: string | null`. With `hideTiers`, `relief` shows the `balance` text.

**Rules, in order, for waiting player X at index i of `ordered`:**
1. X is in `plan[0]` → `next`; X is in a later item → `after`.
2. Nobody after index i is in any plan item → `null` (a plain wait: the row shows only "Sat out · Played").
3. `X.consecutiveGames >= MAX_CONSECUTIVE` → `streak`.
4. `X.isHost && holdingHosts` → `host`.
5. Let k be the first plan item holding someone after X. If `plan[k].seed !== 0` or its reasons include `copy.reason.setByUmpire` → `manual`. If `plan[k].hard` or `plan[k].noD` → `relief`. If a requested pair is a team in `plan[k]` → `request`. If k ≥ 1 → `courtMix`.
6. k = 0. Let F be `plan[0]`'s four, Y the last of F in `playerPriority`, and G = F with X in Y's place. Take `minGames` over `ordered` and F, `waitWeight` 2 when `singleCourt`, else 1, and compare `groupCost(G)` with `groupCost(F)`. If G costs more: `mix` when `8 × Δfamiliarity ≥ 6 × Δspread`, otherwise `fair`. If G costs the same or less: `balance`.

Rules 3–6 always return a value, so a passed-over row is never left without a reason.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/queueReasons.test.ts — `six()` gives 6 ready players a..f, no matches, equal counters,
// ordered = playerPriority(six()); item(ids, extra?) builds a QueueItem with seed 0 and reasons ["x"]
it("planned players", () => {
  const r = queueReasons({ ordered, plan: [item(["a", "b", "c", "d"]), item(["e", "f", "a", "b"])], matches: [], requestedPairs: [], holdingHosts: false, singleCourt: true });
  expect([r.get("a"), r.get("e")]).toEqual(["next", "after"]);
});
it("nobody below planned: no reason", () => expect(reasonsFor(["a", "b", "c", "d"]).get("e")).toBeNull());
it("played two in a row", () => expect(reasonsFor(["b", "c", "d", "e"], { a: { consecutiveGames: 2 } }).get("a")).toBe("streak"));
it("umpire edited or shuffled", () => {
  expect(reasonsFor(["b", "c", "d", "e"], {}, { seed: 2 }).get("a")).toBe("manual");
  expect(reasonsFor(["b", "c", "d", "e"], {}, { reasons: [copy.reason.setByUmpire] }).get("a")).toBe("manual");
});
it("hard match planned", () => expect(reasonsFor(["b", "c", "d", "e"], {}, { hard: true }).get("a")).toBe("relief"));
it("would repeat a group", () => {
  // a has already met b, c and d twice each; e has met nobody
  expect(reasonsFor(["b", "c", "d", "e"], {}, {}, metTwice("a", ["b", "c", "d"])).get("a")).toBe("mix");
});
// skipped 1 keeps a first in line despite 3 matches played (priority 10 − 1.5)
it("has played more", () => expect(reasonsFor(["b", "c", "d", "e"], { a: { games: 3, skipped: 1 } }).get("a")).toBe("fair"));
it("equal cost: balancing", () => expect(reasonsFor(["b", "c", "d", "e"]).get("a")).toBe("balance"));
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/queueReasons.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Extract `groupCost` in `session.ts` without changing behaviour**

Run: `npx vitest run src/lib/session.test.ts`
Expected: PASS, unchanged. The Phase 2 full-suite run re-checks the sims.

- [ ] **Step 4: Implement `queueReasons.ts`.** Run the Step 1 tests and confirm they pass.

- [ ] **Step 5: Wire it in**

`waitingVM` computes `queueReasons` once from `orderedReady`, `plan`, `state.matches`, `state.requestedPairs`, `holdingHosts` and the open-court count. Each row gets `reason` from `copy.session.why` (null stays null). `SessionTab` shows `w.reason` on its own line under the stats (`.waitingReason`, 14px). It also passes the reason to `youStatus` as `reason`, but only when it isn't `next` or `after`.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/queueReasons.test.ts src/lib/youStatus.test.ts src/lib/copy.test.ts src/styles.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/lib/session.ts src/lib/queueReasons.ts src/lib/queueReasons.test.ts src/types.viewmodel.ts src/hooks/useSessionStore.ts src/components/tabs/SessionTab.tsx src/components/tabs/SessionTab.module.css src/lib/copy.ts
git commit -m "feat: every passed-over queue row says why"
```

---

### Task 9: One-sentence rankings explainer (spec 2.4, F11)

**Files:**
- Create: `src/components/tabs/RankingsInfoSheet.tsx`, extracted from the dialog in `RankingsTab.tsx` (lines ~262–292)
- Test: `src/components/tabs/RankingsInfoSheet.test.tsx`
- Modify: `src/components/tabs/RankingsTab.tsx`, `src/lib/copy.ts` (`rankings.sheet`)

**Interfaces:**
- Produces:
  - `RankingsInfoSheet({ resultMode, hideTier, onClose }: { resultMode: ResultMode; hideTier?: boolean; onClose: () => void })`: shows `sheet.summary`, a `sheet.more` toggle (`aria-expanded`) that reveals today's paragraphs, and Got it. The focus and Escape handling move with it.
  - Copy: `sheet.summary = "Your score compares each match with what your pair was expected to do: 50 is as expected, higher is better."`, `sheet.more = "More"`, `sheet.less = "Less"`.

- [ ] **Step 1: Write the failing test**

```tsx
it("starts with one sentence; the maths waits behind More", () => {
  const text = renderText(<RankingsInfoSheet resultMode="score" onClose={() => {}} />);
  expect(text).toContain(copy.rankings.sheet.summary);
  expect(text).toContain("More");
  expect(text).not.toContain(copy.rankings.sheet.fiftyBody);
});
```

- [ ] **Step 2: Run it, confirm it fails, extract and implement, run again and confirm it passes**

Run: `npx vitest run src/components/tabs/RankingsInfoSheet.test.tsx src/lib/copy.test.ts`

- [ ] **Step 3: Check in the browser.** At 375×667, open How rankings work. Title, summary, More and Got it are all visible without scrolling. Take a screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/RankingsInfoSheet.tsx src/components/tabs/RankingsInfoSheet.test.tsx src/components/tabs/RankingsTab.tsx src/lib/copy.ts
git commit -m "feat: rankings explainer in one sentence, details behind More"
```

- [ ] **Step 5: End of phase**

Run the full `npm test`, `npm run lint` and `npm run build`. In the preview: a watcher picks a name that is passed over and sees the reason; Manage shows a tier hint (use the Matches tab to enter three lopsided results for one C player). Then use superpowers:finishing-a-development-branch. **Remind the user that the rules from Task 6 Step 7 must be published before this deploy.**

---

## Phase 3 · Matchmaking depth

### Task 10: Sim results don't depend on `SIM_NIGHTS` (spec 3.3)

**Files:**
- Modify: `src/lib/matchmaking.sim.test.ts` (line 360)

**Interfaces:**
- Produces: `const NIGHTS = 60;` for every asserting test, with a comment saying why: thresholds are calibrated on 60 nights from `rng(12345)`, and fewer nights change worst-night numbers. `const REPORT_NIGHTS = Number(process.env.SIM_NIGHTS ?? 60);` is used only by the report in Task 11.

- [ ] **Step 1: Show today's failure**

Run: `SIM_NIGHTS=20 npx vitest run src/lib/matchmaking.sim.test.ts`
Expected: 3 failures (as the spec measured).

- [ ] **Step 2: Make the change.**

- [ ] **Step 3: Run the same command**

Expected: PASS, the same as without the variable.

- [ ] **Step 4: Commit**

```bash
git add src/lib/matchmaking.sim.test.ts
git commit -m "test: sim assertions always run the 60 nights they were calibrated on"
```

---

### Task 11: Small-group scenarios, new metrics and CI (spec 3.2)

**Files:**
- Modify: `src/lib/matchmaking.sim.test.ts` (`Night` line 48, `playNight` lines 186–233 and 236–307, `summarize` lines 310–358, new `describe`s at the end)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `queueReasons` (Task 8), `playerPriority` and `readyPool` from `session.ts`.
- Produces, as `summarize` fields:
  - `minMatchupRatio`: the worst night's distinct matchups ÷ matches. A matchup key is the two sorted team keys, sorted and joined.
  - `skipShare`: the average share of a night's matches started while some ready player ranked above one of the four in `playerPriority(readyPool(live, matches))` was left out.
  - `unexplained`: the total, over every match start, of waiting players passed over (someone after them in that order is in any `full` plan item) for whom `queueReasons(...)` gives `null`.
  - `const SMALL: Record<number, { minRatio: number; minMatchupRatio: number; partners: number; gap: number; inARow: number }>`: today's numbers for 5–9 players on `oneCourt` with `planAhead: true`, pasted in from Step 2.

- [ ] **Step 1: Add the three metrics** to `Night` and `summarize` as defined above.

- [ ] **Step 2: Print today's small-group numbers**

Add a temporary test printing `summarize({ players: n, courts: oneCourt, planAhead: true }, NIGHTS, false)` for n = 5…9 (the `SMALL` fields plus `skipShare`).

Run: `npx vitest run src/lib/matchmaking.sim.test.ts -t "temporary"`
Expected: five lines. For 6 players, `minRatio` ≈ 0.27 and `partners` ≈ 2.25, matching the spec.

- [ ] **Step 3: Paste them into `SMALL`, delete the temporary test, and add the asserting tests**

- `describe("small groups on 1 court")`, for n = 5…9: `minRatio`, `minMatchupRatio` and `partners` are no lower than `SMALL[n]`, and `gap` and `inARow` are no higher. These guard against regressions; Task 12 raises the floors.
- `it("every passed-over player has a reason")` for 7×1, 12×2 and 16×2: `unexplained === 0`.
- `it.runIf(process.env.SIM_REPORT)("report")`: prints the spec's table rows (5, 6, 7 on 1 court; 12, 16 and 16-late on 2 courts) with `REPORT_NIGHTS`, including `skipShare`. It asserts nothing.

- [ ] **Step 4: Run the sim file and confirm it passes**

Run: `npx vitest run src/lib/matchmaking.sim.test.ts`
Expected: PASS.

- [ ] **Step 5: Add CI**

`.github/workflows/ci.yml`, on `pull_request` and on `push` to `main`: one job `check`, `ubuntu-latest`, `timeout-minutes: 25`, `actions/checkout@v4`, `actions/setup-node@v4` with `node-version: 22` and `cache: npm`, then `npm ci`, `npm run lint`, `npm test`, `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matchmaking.sim.test.ts .github/workflows/ci.yml
git commit -m "test: small-group sim scenarios, queue-skip and reason metrics, CI"
```

---

### Task 12: Variety for 5–9 players on one court (spec 3.1, F3)

**Files:**
- Modify: `src/lib/session.ts`: `pairCounts` (line 410), `pickBalancedFoursome` (line 437), `pickFour` (line 537), and `buildSuggestion` (line 624, to pass the new counts)
- Test: `src/lib/session.test.ts` (unit), `src/lib/matchmaking.sim.test.ts` (targets)

**Interfaces:**
- Produces:
  - `pairCounts(matches)` also returns `matchup: Map<string, number>`, keyed as in Task 11.
  - `pickBalancedFoursome(four, partnerCount?, matchupCount?)`: between the splits it already considers, fewer exact repeats of the matchup come first, then partner repeats, then the gap. With no `matchupCount`, behaviour is unchanged.
  - `smallGroup(players: Player[]): boolean`: `players.filter((p) => p.status === "ready").length <= 9`, which counts players on court too. Check in `isPlaying`'s callers that on-court players keep `status: "ready"`. If they don't, count `readyPool` plus the players on in-progress matches.
  - The new behaviour applies only when `smallGroup` is true.

**Targets** (Decision 1), at 60 nights on `oneCourt` with `planAhead: true`:

| Players | `minMatchupRatio` | `minRatio` (new group) | `partners` | `gap` | `inARow` |
|---|---|---|---|---|---|
| 5 | ≥ 0.6 | — | ≥ 3 | ≤ 1 | ≤ 4 |
| 6 | ≥ 0.6 | — | ≥ 3 | ≤ 1 | ≤ 2 |
| 7, 8, 9 | ≥ 0.6 | ≥ 0.6 | ≥ 3 | ≤ `SMALL[n].gap` | ≤ 2 |

Every existing sim test must still pass unchanged.

**Candidates, least invasive first.** Stop at the first that meets every target:
- **A.** Small groups pass `matchup` into `pickBalancedFoursome`.
- **B.** A, plus a split tolerance of `bestGap + 2` instead of `+ 1` for small groups.
- **C.** B, plus `8 × (times this exact foursome has played)` added to `pickFour`'s cost for small groups. Add it inside `groupCost` behind a `repeatGroup` count, so `queueReasons` explains it as `mix`.

- [ ] **Step 1: Write the failing unit test**

```ts
it("small groups: the same four are split into a matchup they haven't played", () => {
  // a+b vs c+d played twice; all four are tier B, so every split is equally even
  const four = ["a", "b", "c", "d"].map((id) => makeBlankPlayer(id, id, "B", "ready"));
  const done = [match(["a", "b"], ["c", "d"]), match(["a", "b"], ["c", "d"])];
  const { partner, matchup } = pairCounts(done);
  const { team1, team2 } = pickBalancedFoursome(four, partner, matchup);
  expect(new Set([team1.map((p) => p.id).sort().join(""), team2.map((p) => p.id).sort().join("")])).not.toEqual(new Set(["ab", "cd"]));
});
```

- [ ] **Step 2: Add the target tests** to `matchmaking.sim.test.ts` as `describe("variety for small groups on 1 court")` with the table above. Then run both test files and confirm the new tests fail.

Run: `npx vitest run src/lib/session.test.ts src/lib/matchmaking.sim.test.ts -t "small"`

- [ ] **Step 3: Implement candidate A.** Run the target tests. If they fail, add B, then C, re-running each time.

- [ ] **Step 4: Run the whole sim file**

Run: `npx vitest run src/lib/matchmaking.sim.test.ts`
Expected: PASS, with every pre-existing threshold untouched. If a pre-existing test fails, or C still misses a target, stop and report the measured table.

- [ ] **Step 5: Record the numbers**

Above the new `describe`, write a comment with the before → after table for 5–9 players and the candidate chosen, in the style of the `"partner variety"` comment. Raise the `SMALL` floors from Task 11 to the new values.

- [ ] **Step 6: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts src/lib/matchmaking.sim.test.ts
git commit -m "feat: small groups on one court get new matchups and more partners"
```

- [ ] **Step 7: End of phase**

Run the full `npm test`, `npm run lint` and `npm run build`. Run `SIM_REPORT=1 npx vitest run src/lib/matchmaking.sim.test.ts -t report` and paste the printed table into the PR description. Then use superpowers:finishing-a-development-branch.

---

## Phase 4 · Umpire and polish

### Task 13: Serve indicator (spec 4.1, F6)

**Files:**
- Create: `src/lib/serve.ts`, `src/lib/serve.test.ts`
- Modify: `src/types.ts` (`Match.serve?`), `src/lib/session.ts` (`applyLiveScore` line 240, `syncFingerprint` line 250), `src/hooks/useSessionStore.ts` (scorekeeper state ~line 129, `openScorekeeper`/`skPoint`/`skSetT1`/`skSetT2`/`skUndo` lines 592–652, `applyRemoteUpdate` line 277, the `scorekeeper` VM), `src/components/modals/ScorekeeperSheet.tsx`, `src/components/modals/ScorekeeperSheet.module.css`, `src/lib/copy.ts` (`scorekeeper`)
- Test: `src/components/modals/ScorekeeperSheet.test.tsx`

**Interfaces:**
- Produces (`src/lib/serve.ts`):
  - `type Team = "t1" | "t2"`; `interface ServeState { serving: Team; right: { t1: 0 | 1; t2: 0 | 1 } }`, where `right[team]` is the index (in `Match.t1` / `t2`) of the player in that team's right service court.
  - `startServe(team: Team, server: 0 | 1): ServeState`: `server` stands right, and the receiving team's index 0 stands right.
  - `afterRally(s: ServeState, winner: Team): ServeState`: when the serving team wins, its two players swap courts. When the receivers win, they serve next and nobody moves.
  - `serverOf(s: ServeState, score: { t1: number; t2: number }): { team: Team; player: 0 | 1; side: "right" | "left" }`. `side` is right when the serving team's score is even, and `player` is whoever stands on that side.
  - `swapReceivers(s: ServeState): ServeState`: flips `right` for the team not serving (to fix a wrong guess of who receives first).
- Produces (elsewhere):
  - `Match.serve?: ServeState`, kept only while the match is in progress. A typed score deletes the key (never sets `undefined`). Scorekeeper history entries become `{ t1; t2; serve?: ServeState }`, and Undo restores `serve` too.
  - `syncFingerprint` blanks `serve` on in-progress matches, as it does live points.
  - Scorekeeper VM: `serve: { name: string; side: "right" | "left" } | null`, `serverChoices: { label: string; onPick: () => void }[]` (the four names, shown when `serve` is null), `onSwapReceivers: () => void`. The sheet only shows these for `resultMode === "score"`.
  - Copy: `scorekeeper.serving(name: string, side: string) => \`${name} serves from the ${side}\``, `scorekeeper.whoServes = "Who serves?"`, `scorekeeper.swapReceivers = "Swap receivers"`.

- [ ] **Step 1: Write the failing rule test** (BWF doubles, worked through by hand; team 1 = A0, A1, team 2 = B0, B1; A0 serves first from the right, B0 receives)

```ts
const winners: Team[] = ["t1","t1","t2","t2","t1","t2","t1","t1","t1","t2","t2","t2","t1","t2","t1","t1","t2","t1","t1","t2"];
const expected = [
  ["A0","left","1-0"],["A0","right","2-0"],["B1","left","2-1"],["B1","right","2-2"],["A1","left","3-2"],
  ["B0","left","3-3"],["A0","right","4-3"],["A0","left","5-3"],["A0","right","6-3"],["B1","right","6-4"],
  ["B1","left","6-5"],["B1","right","6-6"],["A1","left","7-6"],["B0","left","7-7"],["A0","right","8-7"],
  ["A0","left","9-7"],["B1","right","9-8"],["A1","right","10-8"],["A1","left","11-8"],["B0","left","11-9"],
];
it("follows badminton doubles service over 20 rallies", () => {
  let s = startServe("t1", 0);
  const score = { t1: 0, t2: 0 };
  expect(serverOf(s, score)).toEqual({ team: "t1", player: 0, side: "right" });
  winners.forEach((w, i) => {
    s = afterRally(s, w);
    score[w]++;
    const { team, player, side } = serverOf(s, score);
    expect([`${team === "t1" ? "A" : "B"}${player}`, side, `${score.t1}-${score.t2}`]).toEqual(expected[i]);
  });
});
it("swapReceivers only moves the team not serving", () => {
  expect(swapReceivers(startServe("t1", 1))).toEqual({ serving: "t1", right: { t1: 1, t2: 1 } });
});
```

- [ ] **Step 2: Run it, confirm it fails, implement `serve.ts`, run again and confirm it passes**

Run: `npx vitest run src/lib/serve.test.ts`

- [ ] **Step 3: Write the failing sheet test**

`renderText(<ScorekeeperSheet {...props({ serve: { name: "Ana", side: "right" } })} />)` contains "Ana serves from the right". With `serve: null` and `serverChoices` for Ana, Budi, Citra and Dewi, it contains "Who serves?" and all four names. This covers a reopened sheet or a typed score (Review Focus 3).

- [ ] **Step 4: Wire the store and the sheet**

`skPoint` advances `serve` with `afterRally` when it is known. `skSetT1`/`skSetT2` clear it. Picking a server calls `startServe(team, index)` and writes it onto the match through `applyLiveScore(matches, id, s1, s2, serve)`. That function's new 5th parameter is `serve: ServeState | null | undefined`, where `null` deletes the key and `undefined` leaves it alone. `openScorekeeper` reads `m.serve`, and `applyRemoteUpdate`'s reset carries the merged match's `serve`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/serve.test.ts src/components/modals/ScorekeeperSheet.test.tsx src/lib/session.test.ts src/lib/copy.test.ts src/styles.test.ts`

- [ ] **Step 6: Check in the browser.** Start a score-mode match, open the scorekeeper, pick a server, then tap +1 for team A, team A, team B. The line reads A0 left, A0 right, then B1 left (as in rallies 1–3). Undo goes back to A0 right. Take a screenshot.

- [ ] **Step 7: Commit**

```bash
git add src/lib/serve.ts src/lib/serve.test.ts src/types.ts src/lib/session.ts src/hooks/useSessionStore.ts src/components/modals src/lib/copy.ts
git commit -m "feat: scorekeeper shows who serves and from which side"
```

---

### Task 14: Compact queue rows (spec 4.2, F8)

**Files:**
- Modify: `src/components/tabs/SessionTab.tsx` (waiting rows, lines 316–352), `src/components/tabs/SessionTab.module.css`, `src/lib/copy.ts` (`session.rowActions(name: string) => \`Actions for ${name}\``)
- Test: `src/styles.test.ts` (as is), `src/components/tabs/SessionTab.test.tsx`

**Interfaces:**
- Produces: each waiting row is a `data-queue-row` element. Line 1 holds the position, a 28px avatar, the name and tags, and the stats (`queueMeta`) pushed right, all with `text-overflow: ellipsis`. Line 2 is the reason from Task 8, and is left out when null. For the umpire, the row is a `<button aria-expanded>` labelled `rowActions(name)`, and tapping it reveals Skip next and Rest below it. Watchers get no button.

- [ ] **Step 1: Write the failing test.** Render `SessionTab` with 8 waiting rows. Read-only: the text has no "Skip next". Umpire: the text has no "Skip next" until a row is open. Static render shows every row closed.

- [ ] **Step 2: Run it, confirm it fails, implement, run again and confirm it passes**

Run: `npx vitest run src/components/tabs/SessionTab.test.tsx src/styles.test.ts`

- [ ] **Step 3: Measure in the browser**

At 375×667, add 12 players in Manage (paste a list), set 1 court, Check in all, and start the match. Then run:

```js
const rows = [...document.querySelectorAll("[data-queue-row]")].slice(0, 8).map((el) => el.getBoundingClientRect().height);
({ rows, max: Math.max(...rows), total: rows.reduce((a, b) => a + b, 0) })
```

Expected: 8 rows, `max ≤ 56` and `total ≤ 448`. Eight rows then fit between the header and the bottom nav. Take a screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/SessionTab.tsx src/components/tabs/SessionTab.module.css src/components/tabs/SessionTab.test.tsx src/lib/copy.ts
git commit -m "feat: compact queue rows, Skip and Rest behind a tap"
```

---

### Task 15: End-to-end test on the Firebase emulator (spec 4.3)

**Files:**
- Modify: `package.json` (devDependencies `@playwright/test`, `firebase-tools`; script `"test:e2e": "firebase emulators:exec --project demo-gobadmin --only auth,database \"playwright test\""`), `src/lib/firebase.ts` (emulator hook-up), `.github/workflows/ci.yml` (job `e2e`), `.gitignore` (`test-results/`, `playwright-report/`)
- Create: `firebase.json`, `.env.e2e`, `playwright.config.ts`, `e2e/live-session.e2e.ts`

**Interfaces:**
- Produces:
  - `firebase.ts`: when `import.meta.env.VITE_FIREBASE_EMULATOR === "1"`, call `connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true })` and `connectDatabaseEmulator(database, "127.0.0.1", 9000)` right after creating them.
  - `firebase.json`: `{ "database": { "rules": "database.rules.json" }, "emulators": { "auth": { "port": 9099 }, "database": { "port": 9000 }, "ui": { "enabled": false }, "singleProjectMode": true } }`.
  - `.env.e2e` (committed, no secrets): `VITE_FIREBASE_API_KEY=demo-key`, `VITE_FIREBASE_AUTH_DOMAIN=demo-gobadmin.firebaseapp.com`, `VITE_FIREBASE_DATABASE_URL=http://127.0.0.1:9000/?ns=demo-gobadmin`, `VITE_FIREBASE_PROJECT_ID=demo-gobadmin`, `VITE_FIREBASE_EMULATOR=1`.
  - `playwright.config.ts`: `testMatch: "**/*.e2e.ts"` (so Vitest never picks them up), `workers: 1`, `use.viewport: { width: 375, height: 667 }`, and a `webServer` running `npx vite --mode e2e --port 5174 --strictPort` with `baseURL` `http://localhost:5174`.

- [ ] **Step 1: Install** with `npm i -D @playwright/test firebase-tools` and `npx playwright install chromium`. Add the files and the `firebase.ts` change.

- [ ] **Step 2: Write the test** in three browser contexts (host, umpire, watcher), one `test` per item below. A shared `setUp()` helper has the host run the wizard ("E2E night", players Ana, Budi, Citra, Dewi, Eka pasted, 1 court, Final score), Check in all, Start match, then read the share URL and `PIN: ` from Manage.
  1. **Umpire scores, watcher sees it.** The umpire opens the URL, taps Umpire, enters the PIN and opens the scorekeeper. They type 21 and 15 and save the final result. Within 10 s the watcher's Session tab shows the result in Recent results.
  2. **Refresh mid-match.** The umpire adds 3 points, reloads, and re-enters the PIN. The court still shows the match, and the scorekeeper opens on 3–0.
  3. **Offline mid-match.** `umpireContext.setOffline(true)`, then the umpire saves 21–10, then `setOffline(false)`. Within 15 s the watcher shows 21–10.
  4. **Six wrong PINs.** A fourth context tries `000000` six times. The sixth try shows `copy.gate.locked`.

- [ ] **Step 3: Run it**

Run: `npm run test:e2e`
Expected: 4 passed. If test 2 or 3 fails, the bug is in the app (live points and `serve` are only pushed with the next real push; see `syncFingerprint`). It is not a test to weaken. Stop and use superpowers:systematic-debugging, then report the cause before changing sync behaviour.

- [ ] **Step 4: Add the `e2e` CI job**

It needs `check`, runs on `ubuntu-latest` with `timeout-minutes: 20`, and uses checkout, setup-node 22, `actions/setup-java@v4` (`distribution: temurin`, `java-version: 21`), `npm ci`, `npx playwright install --with-deps chromium` and `npm run test:e2e`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json firebase.json .env.e2e playwright.config.ts e2e src/lib/firebase.ts .github/workflows/ci.yml .gitignore
git commit -m "test: end-to-end host, umpire and watcher on the Firebase emulator, in CI"
```

---

### Task 16: Real-phone check and hallway test (spec 4.4)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-31-smashmatch-9-of-10-review.md` (new section "Phone check, <date>")

This task is for the user to do: an agent can't hold the phone. The plan only provides the checklist.

- [ ] **Step 1: Run the checklist on a mid-range Android in Chrome, outdoors or by a window, at full brightness.** Each row passes when it needs no zoom and no second try.

| # | As | Do | Pass when |
|---|---|---|---|
| 1 | Watcher | Open the link, tap Watch, pick your name | You can say who you play next and why |
| 2 | Watcher | Read an open court's card | The next match's names are readable |
| 3 | Umpire | Open the link, Umpire, enter the PIN | The keypad is numeric and 6 digits fit |
| 4 | Umpire | Score 5 rallies, check the serve line, Undo once | Server and side are right |
| 5 | Host | Manage → a player's Leave | No scrolling needed |
| 6 | Host | Accept a tier hint | One tap |
| 7 | Anyone | Session tab with 8+ waiting | 8 rows on one screen |

- [ ] **Step 2: Hallway test.** At the next session, hand the watch link to five players and ask "who do you play next?" Target: 5 of 5.

- [ ] **Step 3: Record both results** in the spec under "Phone check", then commit.

```bash
git add docs/superpowers/specs/2026-10-31-smashmatch-9-of-10-review.md
git commit -m "docs: real-phone check and hallway test results"
```

- [ ] **Step 4: End of phase.** Run the full `npm test`, `npm run lint`, `npm run build` and `npm run test:e2e`, then use superpowers:finishing-a-development-branch.
