# SmashMatch Mobile UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the mobile-first audit (Chrome, 390×844) found. First, results that are lost or wrong. Then a Session screen that buries the courts. Then controls that are too small or awkward on a phone.

**Architecture:** Logic changes go into pure helpers in `src/lib/session.ts`, unit-tested with Vitest. The hook `useSessionStore.ts` only wires them in. Layout, touch and readability changes live in component CSS modules and are verified in the browser with the measurement script below. The work builds on branch `copy/ux-audit-fixes`: branch from it, or from `main` once that branch is merged.

**Tech Stack:** React 18, TypeScript 5.6, Vite 5, CSS Modules, Vitest 2 (new, dev-only).

**Spec:** The "Audit" section below. Evidence comes from a walk-through in Chrome on 2026-09-30 at a 390×844 viewport, on branch `copy/ux-audit-fixes` @ `4464415`.

## Global Constraints

- **Mobile first:** every change is judged at 390×844. At that size nothing may scroll horizontally (`scrollWidth === clientWidth`).
- **Tap targets:** every button, select, summary and input is at least 44px tall. Exception: pill buttons inside list rows (`.pillBtn`) are at least 40px tall, with at least 8px between neighbours.
- **Readable text:** no visible text smaller than 12px. Text contrast is at least 4.5:1 against its background. Placeholders and disabled controls are exempt.
- **Text inputs:** every `input`, `select` and `textarea` uses font-size ≥ 16px, so iOS Safari doesn't zoom in on focus.
- **Vocabulary** (from the previous plan's glossary): Waiting, Not checked in, Resting (players), Paused (courts only), Tier with "A strongest".
- **Singular and plural:** "1 match", "1 player", "1 court" everywhere.
- **Read-only Player view** (`isReadOnlyPlayer`): never shows tiers or the PIN, and never tells the viewer to tap something.
- **Dependencies:** the only new dependency is `vitest` (`^2.1.9`, dev only).

## Audit

1. **Live score is lost.** Points entered with +1 aren't written to the match until "Save Final Result". Closing the sheet at 3–1 and reopening shows 0–0. The court card and live viewers see 0–0 for the whole match.
2. **The scorer opens with an error.** At 0–0 it says "Scores can't tie in badminton — cancel this match…" and shows a disabled "Can't Save a Tie". The same happens at every level score during play (5–5, 20–20 deuce).
3. **Medals for players who haven't played.** Rankings sort by `rating`, and anyone who hasn't played sits at 1100, above everyone who lost. In the test session Eka won 🥉 with 0 games. The share image lists people who haven't played as "0% · 0–0".
4. **The Session screen pushes courts down.** The first court starts at y358 of 781 usable px. Court 2's "Enter Score" is at y820, behind the nav. Recent Results is at y1429. "Who should play next" repeats the court suggestion and the Waiting order.
5. **Tap targets are too small.** Sit Out Next and Rest are 27px; Matches actions 25px; court ± and close buttons 32px. "Wrong match? Cancel it instead" is 26px, directly under Save.
6. **Inputs use 13px text**, so iOS zooms in on focus. Affected: wizard name and schedule, player name, paste-a-list, the partner-request selects and the Edit Match selects.
7. **Enter does nothing when adding a player**, because there's no `<form>`.
8. **Manage is 1863px tall.**
   - The End/Erase buttons are at y1669, under the roster.
   - Roster rows wrap three buttons onto a second line.
   - A player can't be renamed or removed.
   - Tier can only be changed inside Rankings.
9. **Toasts cover content.** They sit at `bottom: 86px`, over court 2's score and buttons.
10. **The header says "No session set up yet" whenever there are 0 courts**, even right after "New session started".
11. **Scoring wording and limits.** "Game point reached" appears at 21–15, when the game is over. +1 keeps counting past the end (23–15).
12. **Ambiguous confirm buttons.** "Cancel" (dismiss) sits next to "Cancel It & End Session".
13. **The end screen is a dead end:** no share action.
14. **The viewer entry screen gives no context**, and "Umpire", the rarer PIN-gated role, is styled as the main button.
15. **Low contrast and small text.** Helper and empty-state text measures 2.8:1. Much of the text is 10.5–11px.
16. **The wizard's players step shows only a count** of who you added.
17. **Regression:** "Tier (A strongest):" wraps apart from its A/B/C picker at 390px.
18. **"Tough opponent" shows someone you never lost to** ("0% loss").
19. **Polish:**
   - No web-app manifest or theme colour.
   - No `touch-action: manipulation` on buttons.
   - The pulsing dot and the sheet animation ignore `prefers-reduced-motion`.

## Review Focus

- **A second device scoring the same match live (Umpire).** Points must reach the organizer's court card as they're entered, and closing either sheet keeps them. Tested by `applyLiveScore` in Task 2. The executor also checks it in the browser if a Firebase project is available.
- **Fixing the score of a completed match.** Rankings must not change while the fix is being typed, only on "Update Result". Covered by the test `applyLiveScore leaves completed matches untouched` in Task 2.
- **Removing a player who is in a partner request, or who is on a court right now.** Removing is refused when they're on a court, and their partner request is dropped. Covered by the test `canRemovePlayer refuses players with any match` and Task 5 Step 5.
- **A session where nobody has played yet.** No medals, no rank numbers, and the Share button is hidden. Covered by the test `rankPlayers gives no rank to players without games` and Task 1 Step 5.
- **A 30-character player name at 390px** in the renamed roster row and the waiting row. It wraps with no horizontal scroll. Covered by the measurement script in Task 4 Step 6 and Task 5 Step 7.

## Measurement script (used by Tasks 3–7)

Run it in the browser preview at 390×844 on each screen named in a task. The expected result is `{"small":[],"tiny":[],"lowContrast":[],"overflow":false}`.

```js
(() => {
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > 0.6) return c.slice(0, 3); } return [46, 43, 37]; };
  const small = [], tiny = [], lowContrast = [];
  for (const el of document.querySelectorAll("button,select,summary,input,textarea")) {
    const r = el.getBoundingClientRect(); if (!r.width || el.disabled) continue;
    const min = /pillBtn/.test(el.className) ? 40 : 44;
    if (r.height < min) small.push(`${(el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24)} ${Math.round(r.height)}px`);
  }
  for (const el of document.querySelectorAll("body *")) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!text || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    if (fs < 12) tiny.push(`${text.slice(0, 24)} ${fs}px`);
    const [a, b] = [lum(rgb(cs.color).slice(0, 3)), lum(bg(el))];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 4.5 && !el.closest("button:disabled")) lowContrast.push(`${text.slice(0, 24)} ${ratio.toFixed(2)}`);
  }
  return JSON.stringify({ small, tiny, lowContrast, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth });
})();
```

The browser preview must never load the real `.env.local` Firebase project. Use a dev server started with dummy `VITE_FIREBASE_*` values: API key `dummy-key`, database URL `http://127.0.0.1:9/?ns=demo`. Put it in a script in the scratchpad and add a temporary `.claude/launch.json` entry, then restore `launch.json` afterwards.

## File Structure

- `package.json`: add the `vitest` dev dependency and a `"test": "vitest run"` script.
- `src/lib/session.ts`: new pure helpers `rankPlayers`, `applyLiveScore`, `nameTaken`, `canRemovePlayer`, `isFirstRun`, plus the tough-opponent fix.
- `src/lib/session.test.ts` (new): Vitest tests for those helpers.
- `src/hooks/useSessionStore.ts`: wires in the helpers; new actions `updatePlayer` and `removePlayer`.
- `src/types.viewmodel.ts`: `RankingEntry.rank` and `ShareRankingEntry.rank` become `number | null`.
- Components and their `.module.css`: layout, touch, copy.
- `public/manifest.webmanifest` (new), `index.html`: install metadata.

---

### Task 1: Test runner and correct rankings (audit 3, 18)

**Files:**
- Modify: `package.json`, `src/lib/session.ts:198-317`, `src/hooks/useSessionStore.ts:972-999` (rankingsVM), `:1323-1335` (shareRankingsTop), `src/types.viewmodel.ts` (`RankingEntry`, `ShareRankingEntry`)
- Modify: `src/components/tabs/RankingsTab.tsx`, `src/components/ReviewScreen.tsx`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Produces: `rankPlayers(players: Player[]): { player: Player; rank: number | null }[]`. Players with `games > 0` come first, sorted by `rating` descending, then `wins` descending, then `name`, and are ranked 1..n. Players with `games === 0` follow, sorted by `name`, with `rank: null`.
- Produces: `RankingEntry.rank: number | null` and `ShareRankingEntry.rank: number`. The share card only ever contains ranked players.

- [ ] **Step 1: Add Vitest.** Run `npm i -D vitest@^2.1.9` and add the script `"test": "vitest run"`.
- [ ] **Step 2: Write the failing tests** in `src/lib/session.test.ts`. Build players with `makeBlankPlayer` and matches as plain `Match` objects, using `recomputePlayerStats` to fill in stats.

```ts
it("rankPlayers gives no rank to players without games", () => {
  // Ana+Bo beat Cy+Di 21-15; Eka has not played
  const ranked = rankPlayers(stats);
  expect(ranked.map((r) => [r.player.name, r.rank])).toEqual([
    ["Ana", 1], ["Bo", 2], ["Cy", 3], ["Di", 4], ["Eka", null],
  ]);
});
it("recomputePlayerStats shows no tough opponent without a loss", () => {
  expect(stats.find((p) => p.name === "Ana")!.toughOpp).toBe("—");
  expect(stats.find((p) => p.name === "Cy")!.toughOpp).not.toBe("—");
});
```

- [ ] **Step 3: Run the tests.** `npm test`. Expected: FAIL, "rankPlayers is not a function" and the toughOpp assertion.
- [ ] **Step 4: Implement.** Add `rankPlayers` in `session.ts`. In `recomputePlayerStats`, set `toughOpp` only when the worst opponent's `losses > 0`.
- [ ] **Step 5: Wire it into the UI.**
  - Build `rankingsVM` from `rankPlayers(livePlayers)`.
  - `shareRankingsTop` takes the first 5 entries with `rank !== null`.
  - The Rankings "Share Rankings" button shows only when at least one player is ranked.
  - `RankingsTab` shows "—" in the rank column and no medal when `rank === null`.
  - `ReviewScreen` shows "—" for unranked players.
- [ ] **Step 6: Verify.** `npm test && npm run build && npm run lint`. Expected: all pass.
- [ ] **Step 7: Commit.** `git commit -m "fix: rank only players who have played; no tough opponent without a loss"`

### Task 2: Live scoring you can't lose (audit 1, 2, 11)

**Files:**
- Modify: `src/lib/session.ts`, `src/hooks/useSessionStore.ts:413-435` (skPoint, skSetT1, skSetT2, skUndo) and `:1290-1296`
- Modify: `src/components/modals/ScorekeeperSheet.tsx`, `ScorekeeperSheet.module.css`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Produces: `applyLiveScore(matches: Match[], matchId: string, s1: number, s2: number): Match[]`. It returns matches with that match's `s1`/`s2` replaced only if its `status === "in_progress"`; otherwise it returns a copy with nothing changed.

- [ ] **Step 1: Write the failing tests.**

```ts
it("applyLiveScore writes points to an in-progress match", () => {
  expect(applyLiveScore([live], live.id, 3, 1).find((m) => m.id === live.id)).toMatchObject({ s1: 3, s2: 1, status: "in_progress" });
});
it("applyLiveScore leaves completed matches untouched", () => {
  expect(applyLiveScore([done], done.id, 30, 0)[0]).toMatchObject({ s1: done.s1, s2: done.s2 });
});
```

- [ ] **Step 2: Run them.** `npm test`. Expected: FAIL, applyLiveScore not defined.
- [ ] **Step 3: Implement and wire in.** Implement `applyLiveScore`. In `skPoint`, `skSetT1`, `skSetT2` and `skUndo`, set `matches: applyLiveScore(s.matches, s.scorekeeperMatchId, t1, t2)` in the same `setState`. `closeScorekeeper` stays as it is: reopening reads `m.s1/m.s2`, so it resumes where you left off.
- [ ] **Step 4: Only warn about a tie on Save.** In `ScorekeeperSheet`:
  - The save button is never disabled for a tie.
  - Its label is "Save Final Result" (or "Update Result" when editing a completed match).
  - `handleSave` on a tie sets a local `tieAttempted` state instead of saving.
  - The tie note ("Scores can't tie in badminton — cancel this match below if it can't be finished") shows only when `tieAttempted && isTie`.
  - `tieAttempted` resets when `courtLabel` changes, the same way `pendingConfirm` does.
  - Remove the "Can't Save a Tie" label.
- [ ] **Step 5: Game-over wording and limit.**
  - The note shown when `isGameOver` → "Game over — save the result".
  - Both +1 buttons get `disabled={isGameOver}`, with a `.plusBtn:disabled { opacity: 0.4 }` style. Undo and the number inputs stay enabled.
- [ ] **Step 6: Verify.** Run `npm test && npm run build && npm run lint`. Then in the preview:
  - Start a match and open the sheet. Expected: no tie note and Save enabled.
  - Score 3–1, close, check the court card, then reopen. Expected: the court card shows 3–1 and the sheet reopens at 3–1.
  - Score to 21–15. Expected: "Game over — save the result", and +1 is disabled.
- [ ] **Step 7: Commit.** `git commit -m "fix: live points persist on the match; tie warning only on save; game-over wording"`

### Task 3: A Session screen that leads with the courts (audit 4, 9)

**Files:**
- Modify: `src/components/tabs/SessionTab.tsx`, `SessionTab.module.css`, `src/components/Toast.module.css`, `src/hooks/useSessionStore.ts` (remove `topPriorityWaiting` from the `session` view model if it's no longer used)

- [ ] **Step 1: New order in `SessionTab`.**
  1. Title row and chips
  2. Check-in banner
  3. Courts
  4. Next Up
  5. Waiting panel
  6. Recent Results

  Delete the "Who should play next" panel and its CSS. The Waiting list is already in priority order (`orderedReady`), and the first row's meta line becomes "Next up · Waited n match|matches".
- [ ] **Step 2: Health strip.** Move it inside the Waiting panel, as one line under the panel title. It renders only when `sessionHealth.hasWarning`.
- [ ] **Step 3: Recent Results.** Show at most 3 rows, plus a "See all matches" link button that switches to the Matches tab (`store.tabs.setActiveTab("matches")`, passed in as `onSeeAllMatches`).
- [ ] **Step 4: Toast placement.** Use `top: calc(env(safe-area-inset-top) + 12px)` with `bottom: auto`, `max-width: calc(100% - 32px)`, `white-space: normal` and `text-align: center`.
- [ ] **Step 5: Verify.** Run `npm run build && npm run lint`. In the preview at 390×844, with 2 courts and 10 players checked in and both courts open, run this after `scrollTo(0,0)`:

```js
({ court1Top: document.querySelector('[class*="card"] [class*="courtName"]').closest('[class*="card"]').getBoundingClientRect().top,
   navTop: document.querySelector("nav").getBoundingClientRect().top,
   startTops: [...document.querySelectorAll("button")].filter((b) => b.innerText === "Start Match").map((b) => b.getBoundingClientRect().bottom) })
```

Expected: `court1Top < 200` (it was 358), and every value in `startTops` is below `navTop`, so both courts' Start Match buttons are visible without scrolling. Trigger a toast and confirm it doesn't overlap any court card button.
- [ ] **Step 6: Commit.** `git commit -m "feat: session screen leads with courts; toasts move to the top"`

### Task 4: Touch and input ergonomics (audit 5, 6, 7, 17, 19 touch/motion)

**Files:**
- Modify: `src/index.css`, `src/components/PlayerAddForm.tsx`, `PlayerAddForm.module.css`, and the CSS modules for SessionTab, ManageTab, MatchesTab, CourtCard, ScorekeeperSheet, SetupWizardModal, EditMatchModal, ConfirmModal, LevelPicker, RankingsTab, RemoteGate

- [ ] **Step 1: Global rules in `index.css`.**
  - `button, select, summary, input, textarea { touch-action: manipulation; }`
  - `input, select, textarea { font-size: 16px; }`, and remove every smaller font-size on those elements in the modules.
  - A `@media (prefers-reduced-motion: reduce)` block that sets `animation: none` on `.pulsing` (CourtCard) and on the sheet.
- [ ] **Step 2: Tap targets.** Raise every control the measurement script flags to the Global Constraints minimums. Known offenders:
  - `.pillBtn` (Session, Manage), 27px → 40
  - `.actionBtn` (Matches), 25px → 44
  - `.roundBtn` (wizard, Manage) and every `.closeBtn`, 32px → 44×44
  - Scorekeeper `.undoBtn` and `.saveBtn`, 38px → 44
  - `.cancelMatchBtn`, 26px → 44, with a 16px `margin-top`
  - CourtCard `.pauseLink` → 44
  - LevelPicker options → 44×44
- [ ] **Step 3: Enter adds a player.**
  - Wrap the single-add row in `<form onSubmit={(e) => { e.preventDefault(); onAddPlayer(); }}>` and make the add button `type="submit"`.
  - The name input gets `autoCapitalize="words"`, `autoComplete="off"` and `enterKeyHint="done"`.
  - In bulk mode, the textarea keeps its newlines (no form).
- [ ] **Step 4: Keep the tier label with its picker.** In `PlayerAddForm`, the name input takes a full row (`flex-basis: 100%`). The second row is a `.tierGroup` (`display: inline-flex; align-items: center; gap: 8px; white-space: nowrap`) holding the "Tier (A strongest):" label and the `LevelPicker`, followed by the add button.
- [ ] **Step 5: Separate the destructive scorer link.** "Wrong match? Cancel it instead" sits 16px below the footer, in `--sm-danger-text`, and stays a full-width 44px text button.
- [ ] **Step 6: Verify.** Run `npm run build && npm run lint`. In the preview at 390×844, run the measurement script on:
  - Session, Matches, Rankings (with a row expanded) and Manage
  - the wizard (steps 1–3)
  - the scorekeeper sheet and the Edit Match dialog
  - a waiting row whose player is named "Abcdefghijklmnopqrstuvwxyz1234"

  Expected: `small` is empty and `overflow` is false on every screen. Then, in the wizard, focus the player name, type "andi" and dispatch Enter on the form. Expected: the roster count goes up by 1.
- [ ] **Step 7: Commit.** `git commit -m "fix: 44px tap targets, 16px inputs, Enter adds a player, tier label stays with picker"`

### Task 5: Manage that fits a phone, with rename and remove (audit 8)

**Files:**
- Modify: `src/lib/session.ts`, `src/hooks/useSessionStore.ts` (`addPlayer` ~687, `addPlayers` ~705, `managePlayersVM` ~1125-1165, `manage` view model), `src/components/tabs/ManageTab.tsx`, `ManageTab.module.css`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Produces: `nameTaken(players: Player[], name: string, exceptId?: string): boolean`. It compares trimmed names case-insensitively and ignores `exceptId`.
- Produces: `canRemovePlayer(player: Player, matches: Match[]): boolean`. True only when `player.games === 0` and no match of any status includes the player's id.
- Produces store actions `updatePlayer(id: string, name: string, level: SkillLevel): void` and `removePlayer(id: string): void`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("nameTaken matches case-insensitively and trims", () => {
  expect(nameTaken(players, " andi ")).toBe(true);
  expect(nameTaken(players, "Andi", andi.id)).toBe(false);
});
it("canRemovePlayer refuses players with any match", () => {
  expect(canRemovePlayer(eka, [])).toBe(true);
  expect(canRemovePlayer(ana, [liveWithAna])).toBe(false);
});
```

- [ ] **Step 2: Run them.** `npm test`. Expected: FAIL, the functions are not defined.
- [ ] **Step 3: Implement both helpers.** Make `addPlayer` and `addPlayers` use `nameTaken`; the existing toast copy stays.
- [ ] **Step 4: Implement the store actions.**
  - `updatePlayer` trims the name. If the name is taken it shows the existing duplicate toast and doesn't save; otherwise it sets name and level and toasts "Player updated".
  - `removePlayer` returns early unless `canRemovePlayer`. It drops the player and any `requestedPairs` entry containing them, then toasts "`{name}` removed".
- [ ] **Step 5: Roster rows.**
  - Each row shows name, tier and status on the left, with at most two pills on the right: the status action (Check In / Back to Waiting / Rejoin / Leave) and "Edit".
  - Remove Sit Out Next and Rest from the roster; they stay on the Session tab.
  - "Edit" expands the row in place: a name input (16px), a `LevelPicker`, and Save / Cancel / Remove. Remove only renders when `canRemovePlayer`, and it's a 44px danger text button.
  - Keep one row open at a time in `ManageTab` local state (`editingId: string | null`).
- [ ] **Step 6: Panel order.**
  1. Add a Walk-in Player
  2. Courts
  3. Session (the three session buttons, with the title "Session")
  4. Live Sharing
  5. Partner Requests
  6. Roster, last
- [ ] **Step 7: Verify.** Run `npm test && npm run build && npm run lint`. In the preview at 390×844 with 10 players:
  - "End & See Results" has `top < 844` after `scrollTo(0,0)`.
  - Rename "Budi" to "andi". Expected: the duplicate toast and nothing saved.
  - Rename him to "Budi S". Expected: the new name shows on the Session tab.
  - Remove a player who hasn't played. Expected: they're gone from the roster and from any partner request.
  - Run the measurement script with a row open.
- [ ] **Step 8: Commit.** `git commit -m "feat: compact Manage — session actions up top, edit/rename/remove players, roster last"`

### Task 6: Flow fixes (audit 10, 12, 13, 14, 16)

**Files:**
- Modify: `src/lib/session.ts`, `src/hooks/useSessionStore.ts` (lines 276, 1365, the `setup` view model), `src/components/modals/ConfirmModal.tsx`, `src/App.tsx`, `src/components/ReviewScreen.tsx`, `src/components/RemoteGate.tsx`, `RemoteGate.module.css`, `src/components/modals/SetupWizardModal.tsx`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Produces: `isFirstRun(playersCount: number, courtsCount: number): boolean`, true only when both are 0.
- Produces: `setup.rosterNames: { name: string; level: SkillLevel }[]`.

- [ ] **Step 1: Write the failing test.** `expect(isFirstRun(0, 0)).toBe(true); expect(isFirstRun(10, 0)).toBe(false); expect(isFirstRun(0, 2)).toBe(false);`, then run `npm test`. Expected: FAIL.
- [ ] **Step 2: Header.** Implement `isFirstRun` and use it for both `header.needsSetup` and the auto-open effect at line 276.
- [ ] **Step 3: Confirm dialog.** The ConfirmModal dismiss button's label changes from "Cancel" to "Go Back".
- [ ] **Step 4: End screen.**
  - `ReviewScreen` gets an `onShareRankings` prop, shown as a "Share Rankings" button above "New Session", only when at least one player is ranked.
  - In `App.tsx` review mode, render `<ShareRankingsModal {...store.shareRankings} />` next to `ReviewScreen`.
- [ ] **Step 5: Viewer entry screen.**
  - Title → "Join live session".
  - Body → "Someone shared a live badminton session with you. Choose how you're joining."
  - "Player (just watching)" uses the primary (filled) style; "Umpire (I'm scoring)" uses the secondary (outline) style.
- [ ] **Step 6: Wizard players step.** Under the add form, list `rosterNames` as wrapping chips ("Andi · B"), scrollable with a `max-height` of 120px. This is display only; editing happens in Manage (Task 5).
- [ ] **Step 7: Verify.**
  - Run `npm test && npm run build && npm run lint`.
  - In the preview, start a session with players and 0 courts. Expected: the header shows the session name, not "No session set up yet".
  - End a session with a match in progress. Expected: the dialog reads "Go Back" / "Cancel It & End Session".
  - On the Review screen, open Share Rankings and close it.
  - Open `/?view=x`. Expected: the new copy, with Player as the filled button.
- [ ] **Step 8: Commit.** `git commit -m "fix: first-run header, Go Back in confirms, share from the end screen, clearer viewer entry, wizard roster list"`

### Task 7: Readable text (audit 15)

**Files:**
- Modify: `src/styles/theme.css`, and the component CSS modules the script flags

- [ ] **Step 1: Raise the secondary text colour.**
  - `--sm-text-3` → `var(--color-neutral-400)` (#c0b6a5, about 5.9:1 on `--sm-surface` #3a362c).
  - Classes that use `--sm-text-4` for readable text (for example `.emptyNote`, `.stepHint`, `.fieldHint`, `.waitingMeta`, `.courtsSub`, `.pinHint`, `.ratingCaption`) switch to `--sm-text-3`.
  - `--sm-text-4` stays for placeholders and disabled states only.
- [ ] **Step 2: Minimum font size.** Raise every font-size below 12px in the component modules to 12px. This includes the uppercase labels.
- [ ] **Step 3: Verify.** Run `npm run build && npm run lint`, then the measurement script on every screen listed in Task 4 Step 6. Expected: `tiny` and `lowContrast` are empty and `overflow` is false.
- [ ] **Step 4: Commit.** `git commit -m "style: readable text — 4.5:1 contrast and 12px minimum"`

### Task 8: Installable on a phone (audit 19)

**Files:**
- Create: `public/manifest.webmanifest`
- Modify: `index.html`

- [ ] **Step 1: Create the manifest.** `name` "SmashMatch", `short_name` "SmashMatch", `start_url` "/", `display` "standalone", `background_color` and `theme_color` "#2e2b25", and `icons`: `[{ "src": "/icon.png", "sizes": "1024x1024", "type": "image/png", "purpose": "any maskable" }]`.
- [ ] **Step 2: Update `index.html`.**
  - `<link rel="manifest" href="/manifest.webmanifest">`
  - `<meta name="theme-color" content="#2e2b25">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - Add `viewport-fit=cover` to the viewport meta.
- [ ] **Step 3: Verify.** Run `npm run build`, then `ls dist/manifest.webmanifest`. Expected: the file exists. In the preview, `document.querySelector('link[rel=manifest]')` is not null and fetching `/manifest.webmanifest` returns 200.
- [ ] **Step 4: Commit.** `git commit -m "feat: web app manifest and theme colour for add-to-home-screen"`

## Self-Review

- **Coverage:** audit 1, 2 and 11 → Task 2; 3 and 18 → Task 1; 4 and 9 → Task 3; 5, 6, 7, 17 and the touch/motion part of 19 → Task 4; 8 → Task 5; 10, 12, 13, 14 and 16 → Task 6; 15 → Task 7; the rest of 19 → Task 8.
- **Names:** `rankPlayers`, `applyLiveScore`, `nameTaken`, `canRemovePlayer`, `isFirstRun`, `updatePlayer` and `removePlayer` are each defined once, in the Interfaces block of the task that produces them.
- **Review Focus:** every line has a named test or verification step in its owning task.
- **Not covered, deliberately:** showing the session name on the viewer entry screen. It would need a Firebase read before a role is chosen, which the security rules may not allow; Task 6 uses generic copy instead. Per-name tiers in paste-a-list are also out: tiers are edited in Manage via Task 5.
