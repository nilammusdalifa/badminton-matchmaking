# SmashMatch Copy & UX Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the copy and first-run UX problems found in the audit of https://gobadmin.netlify.app/ so an organizer, an umpire and a read-only viewer always know what a label means and what to do next.

**Architecture:** Mostly string and small-markup changes inside existing components. Three small logic touches: pluralize the priority reason, keep the tier note out of the read-only view, and pass `resultMode` to Manage/Review. No new modules or dependencies.

**Tech Stack:** React 18, TypeScript, Vite, CSS modules. No test runner: each task is verified with `npm run build`, `npm run lint`, a `grep` that must come back empty, and a check in the browser preview (`preview_start {name: "dev"}` at 375×812).

**Spec:** The "Audit" section below. It was checked against the live site on 2026-09-30 and against the source at commit `84fdbdb`.

## Global Constraints

- Voice: plain, second person, short. Sentence case for sentences, hints and toasts. Title Case for buttons and panel titles (matches "Start Match", "Check In All").
- One term per concept. Use the Task 1 glossary everywhere.
- Every count in new or edited copy handles singular and plural ("1 court", "1 match", "1 player"). Don't regress commit `ffe8984`.
- The read-only Player view (`isReadOnlyPlayer` / `hideTier`, commit `9b31667`) never shows tiers and never tells the viewer to do something they can't do.
- Don't rename internal status keys (`"expected"`, `"paused"`, `"ready"`). Change display strings only.
- No new dependencies.

## Audit

**Verdict:** The copy is above average for a small app. It's short and friendly, and it's specific where it matters most: "Need 2 more players to start a doubles match", "Scores can't tie in badminton — cancel this match below…", "add a last initial to tell them apart", and confirm dialogs that spell out consequences. The weak spots are the **first-run flow**, **terminology drift**, **a few copy bugs that state false things**, and **jargon with no explanation**. Ordered by impact:

### A. False or broken copy (fix first)
1. **Priority reason grammar/logic.** The reason reads "`{name} waited {n} matches — top priority`" in `lib/session.ts:177` with no singular form, so it shows "waited 1 matches". At the start of a session it shows "waited 0 matches — top priority". The "Who should play next" card has the same 0 case (`useSessionStore.ts:1170`).
2. **The read-only view leaks tiers.** The suggestion reason "`Split by skill tier for balance (A/B/C/A)`" (`lib/session.ts:180`) appears in the court card and in the Next Up panel for Player-view viewers, despite `hideTier`.
3. **Copy-link fallback points to nothing.** The toast says "Couldn't copy — copy it from the address shown", but Manage never shows the link.
4. **The Manage "Courts" subtitle is always "21 pts to win, cap 30"**, even in Winner Only or No Score sessions.
5. **The Reset confirm contradicts itself:** "rebuilds the roster fresh. Players and settings stay the same". What actually happens is that players stay, but all stats zero out and everyone goes back to not checked in.
6. **The Review screen shows "+0 pts" for everyone** in Winner Only or No Score sessions.
7. **Wizard review step on first run:** "New Session ·" (dangling separator when there's no schedule) and "today's 0 completed matches will be archived, and all 0 players return to Expected" (alarming and meaningless for a new user).

### B. First-run experience
8. A new visitor lands in a modal with two empty fields and no sentence saying what the app does. The `×` close buttons (wizard, Edit Match, Scorekeeper) have no accessible name.
9. "Schedule" gives no hint that it matters. It's shown in the header, and an end time in it triggers the "About 30 minutes left" reminder (`parseScheduleEndTime`).
10. Step 3 says "0 courts" (always plural) with no guidance, and "Start Session" goes through with 0 courts. You then land on "add one in the Manage tab", but the Courts panel is near the bottom of Manage.

### C. Terminology drift
11. Available players are called "Waiting" (chip, panel) and also "Ready" ("added straight to Ready", "Not enough ready players to auto-fill", "Swap in anyone who's ready").
12. Arriving players are called "Expected" (wizard, review) and also "Not checked in" (chip, roster).
13. Resting players: the button says "Rest", the status says "Resting", the chip says "Paused", and the toast says "{name} paused". Courts also use "Paused".
14. Tier: "Tier", "Skill tier", and a bare A/B/C picker with no label in single-add mode. Nothing says **A is the strongest** (`LEVEL_RANK` A:3).

### D. Jargon without help
15. "Longest wait: X · 2 matches" and "Game spread: 3" in the health strip.
16. "Skip Next" and "Rest" are explained only in `title` tooltips, which don't show on touch devices (this is a phone app).
17. Rankings: "rating 1043 — rises and falls with results" (lowercase and vague), and "Avg wait N min · longest streak N games" (every other wait figure is counted in matches, and "streak" reads like a win streak but means consecutive games played).
18. The Partner Requests hint "Put two players on the same team, once — filled in by whoever's most owed a game" is hard to parse, and its button just says "Request".

### E. Consistency and accessibility
19. Buttons: "Add" (wizard) vs "Add Player"; "Add All"; "Fix score" (lower case); in-progress "Cancel" on the Matches tab (reads as closing a dialog); "+ New Session" / "+ Start a New Session" / "Start New Session".
20. "End Session" vs "Reset This Session" sit side by side, and the labels don't say how they differ.
21. The court `–`/`+` buttons have no accessible name. The Umpire PIN warning exists only in `title`.
22. "Image export unavailable" and "Could not generate image" don't say why or what to do next.
23. **Live site only:** Netlify's "Powered by Netlify" badge covers the Rankings and Manage tabs in the bottom nav at 375px width.

### Keep as is
Insufficient-player messages, scorekeeper tie/unfinished guards, confirm dialogs for in-progress matches, Winner Only / No Score explanations, the RemoteGate role copy ("Player (just watching)" / "Umpire (I'm scoring)"), and duplicate-name toasts.

## Review Focus

- **Fresh visitor, zero courts, zero players.** Every empty state names a real next action and where to find it. The wizard review step shows no "0 … will be archived" sentence.
- **Read-only Player view.** No tier letters anywhere, including suggestion reasons and Next Up. No hint that tells the viewer to tap something.
- **Singular counts.** Check skipped = 0, 1 and 2 in both the priority card and the suggestion reason; courts = 1 in wizard step 3 and in the review step.
- **Touch and screen-reader users.** Every icon-only button has an `aria-label`, and no meaning exists only in a `title` attribute.
- **Long names (30 characters) at 375px.** The health strip, waiting rows with the renamed buttons, and the priority card don't overflow horizontally.

## File Structure

- `src/lib/session.ts`: suggestion reasons (pluralization; tier note split out)
- `src/types.ts`: `Suggestion.balanceNote`
- `src/hooks/useSessionStore.ts`: toasts, status labels, confirm copy, `resultMode` passed to manage/review, tier note filtering
- `src/components/modals/SetupWizardModal.tsx`: intro, hints, review step, aria-labels
- `src/components/modals/EditMatchModal.tsx`, `ScorekeeperSheet.tsx`: close-button aria-labels, "ready" wording
- `src/components/tabs/SessionTab.tsx`, `ManageTab.tsx`, `MatchesTab.tsx`, `RankingsTab.tsx`: labels, hints, empty states
- `src/components/CourtCard.tsx`, `PlayerAddForm.tsx`, `ReviewScreen.tsx`, `Header.tsx`: labels

---

### Task 1: Fix false and broken copy (audit A1–A7)

**Files:**
- Modify: `src/types.ts:89-94`, `src/lib/session.ts:150-181`, `src/hooks/useSessionStore.ts` (lines ~750, ~1060, ~1104, ~1170, ~1384, ~1474, ~1504, ~1540)
- Modify: `src/components/tabs/ManageTab.tsx`, `src/components/ReviewScreen.tsx`, `src/components/modals/SetupWizardModal.tsx:140-155`

**Interfaces:**
- Produces: `Suggestion.balanceNote: string | null`. It holds the tier-split sentence, and `reasons` no longer contains it.
- Produces: `manage.resultMode: ResultMode`, `manage.shareUrl: string`, `review.resultMode: ResultMode`, `setup.reviewHasHistory: boolean`.

- [ ] **Step 1: Pluralize and handle 0 in the priority reason.** Apply this in both `lib/session.ts:177` and `useSessionStore.ts:1170`. When skipped is 0, use "`{name} is first in line`" (card: "First in line"). Otherwise use "`{name} has waited {n} match|matches — top priority`" (card: "Waited {n} match|matches — top priority").
- [ ] **Step 2: Split out the tier note.** Add `balanceNote` to `Suggestion`. In `lib/session.ts:180` set `balanceNote: "Teams balanced by tier (" + levels + ")"` and remove that string from `reasons`. The requested-pair branch sets `balanceNote: null`. In the store at ~1060 and ~1104, build `reason` from `reasons`, then append `balanceNote` only when `remoteRole !== "player"` or the app isn't in remote mode.
- [ ] **Step 3: Show the share link.** Expose `shareUrl` from the store (same string `copyShareLink` builds at ~746) and render it in the Live Sharing panel as selectable text under the button. Keep the fallback toast, reworded to "Couldn't copy — select the link below and copy it".
- [ ] **Step 4: Make the Courts subtitle depend on result mode.** Pass `resultMode: state.sessionResultMode` to `manage`. The subtitle reads "`{n} court|courts · 21 points, win by 2, cap 30`" for score, "`… · winner only`" for winner, and "`… · no scoring`" for none.
- [ ] **Step 5: Reword the Reset confirm body.** New text: "Everyone stays on the roster, but all matches, scores and stats are erased and players go back to not checked in. This can't be undone."
- [ ] **Step 6: Hide the Review diff outside score mode.** Pass `resultMode` to `review`. Hide the `{diffLabel} pts` column unless it's `"score"`.
- [ ] **Step 7: Fix the wizard review step.** Render `reviewName` and add ` · {reviewSchedule}` only when the schedule is non-empty. Add `reviewHasHistory = state.completedCount > 0 || state.players.some(p => p.status !== "expected")` and render `reviewConsequence` only when it's true. Rewrite the consequence as "`Starting fresh archives today's {n} completed match|matches and sets all {p} player|players back to not checked in.`"
- [ ] **Step 8: Verify.** Run `npm run build && npm run lint` (expected: exit 0). Run `grep -rn "matches — top priority\|Split by skill tier\|from the address shown\|rebuilds the roster" src`. Expected: only the new strings, or nothing. In the preview, open `?view=<id>` as Player and confirm no `A/`, `B/` or `C/` sequences appear on the page (`get_page_text`).
- [ ] **Step 9: Commit.**

```bash
git add src
git commit -m "fix: correct misleading copy — priority plurals, tier leak in read-only view, share-link fallback, result-mode labels"
```

### Task 2: One vocabulary (audit C11–C14)

**Files:**
- Modify: `SessionTab.tsx`, `ManageTab.tsx`, `EditMatchModal.tsx:142`, `SetupWizardModal.tsx:81`, `RankingsTab.tsx:142`, `PlayerAddForm.tsx`, `useSessionStore.ts` (toasts ~600, ~641, ~699, ~732)

**Interfaces:**
- Produces: the glossary below, which Tasks 3 and 4 use verbatim.

| Concept | Use | Replace |
|---|---|---|
| Checked in, free to play | **Waiting** | "Ready", "ready" |
| On roster, not arrived | **Not checked in** | "Expected" |
| Player on a break | **Resting** (button: **Rest**) | "Paused" (for players), "{name} paused" |
| Court out of use | **Paused** (courts only) | none |
| Skill group | **Tier** (A = strongest, C = newest) | "Skill tier", "level" |

- [ ] **Step 1: Rewrite strings.**
  - `ManageTab.tsx:42` → "They're here now — added straight to Waiting"
  - `useSessionStore.ts:~600` → "Not enough waiting players to auto-fill"
  - `EditMatchModal.tsx:142` → "Swap in anyone who's waiting — teams are rebalanced when you start."
  - `SetupWizardModal.tsx:81` → "They start as not checked in — check them in on the Session tab when they arrive"
  - `useSessionStore.ts:~699` → "`{name} added — check them in when they arrive`"
  - Session chip "Paused {n}" → "Resting {n}"
  - Toast ~641 → "`{name} is resting`"
  - `RankingsTab.tsx:142` "Skill tier:" → "Tier:"
  - Toast ~732 → "Tier updated"
- [ ] **Step 2: Define tiers once.** Add `aria-label="Tier (A strongest, C newest)"` and `role="group"` on the `LevelPicker` wrapper. In `PlayerAddForm` single-add mode, add the same visible "Tier:" label that bulk mode already has.
- [ ] **Step 3: Verify.** Run `npm run build && npm run lint`, then run `grep -rnE "\bReady\b|ready players|who's ready|Expected|Skill tier| paused\"" src/components src/hooks`. Expected: no user-facing string matches (status keys like `"expected"` in comparisons are fine).
- [ ] **Step 4: Commit.**

```bash
git add src
git commit -m "copy: one vocabulary — Waiting, Not checked in, Resting, Tier"
```

### Task 3: First-run wizard and empty states (audit B8–B10)

**Files:**
- Modify: `SetupWizardModal.tsx`, `EditMatchModal.tsx:137`, `ScorekeeperSheet.tsx:62`, `SessionTab.tsx:273`, `ManageTab.tsx` (panel order), `MatchesTab.tsx:15`

- [ ] **Step 1: Add an intro to wizard step 0.** Put a `stepHint` above the fields: "Set up tonight's session — SmashMatch suggests fair doubles matches as players arrive." Under Schedule add the hint "Optional. Add start and end times (e.g. 19:00–22:00) to get a heads-up 30 minutes before the end."
- [ ] **Step 2: Add aria-labels.** Wizard `×` → `aria-label="Close setup"`. EditMatch `×` → `"Close"`. Scorekeeper close → `"Close scorekeeper"`. Court `–`/`+` in the wizard and in Manage → `"Remove a court"` / `"Add a court"`.
- [ ] **Step 3: Clarify the courts step.** Step 2 title → "Courts & scoring". Show "`{n} court|courts`". Field label "Track results" → "How to record results". When `courtsCount === 0`, show the hint "Add at least one court to start suggesting matches." The review step shows the same line as a warning when `courtsCount === 0`. Don't block Start Session.
- [ ] **Step 4: Move Courts higher in Manage.** Move the Courts panel to sit directly under "Add a Walk-in Player", above Roster. Session empty state → "No courts yet — add one in Manage → Courts to start scheduling matches."
- [ ] **Step 5: Improve the Matches empty state.** When `courtsCount === 0`, show "No matches yet — add a court in Manage first." Otherwise keep the current line. Pass `courtsCount` into `matches`.
- [ ] **Step 6: Verify.** Run `npm run build && npm run lint`. In the preview, with cleared `localStorage`, confirm the intro and schedule hint show, and that `read_page` lists `button "Close setup"`, `"Add a court"` and `"Remove a court"`. Add one court and confirm "1 court".
- [ ] **Step 7: Commit.**

```bash
git add src
git commit -m "copy: explain first-run setup, label icon buttons, guide users to courts"
```

### Task 4: Plain-language labels, consistent buttons, clearer toasts (audit D15–D18, E19–E22)

**Files:**
- Modify: `SessionTab.tsx:228-235, 312-317`, `RankingsTab.tsx:118, 137`, `ManageTab.tsx`, `MatchesTab.tsx:42-46`, `CourtCard.tsx`, `PlayerAddForm.tsx:340`, `Header.tsx:400`, `useSessionStore.ts` (toasts ~757, ~779; status labels ~1140-1151; tag ~1208)

- [ ] **Step 1: Health strip.** "Waiting longest: **{name}** ({n} match|matches)" and "Games played: {spread} apart from most to fewest". Keep both on one line at 375px, and let the second span wrap if needed.
- [ ] **Step 2: Waiting-row buttons.** "Skip Next" → "Sit Out Next" (roster action at ~1150 too). Keep "Rest". Add a visible one-line helper under the Waiting panel title: "Sit Out Next skips one match. Rest keeps them out until you bring them back." Remove the `title` attributes. Not-in-rotation tag "Sitting out next round" → "Sitting out next match".
- [ ] **Step 3: Rankings.** Caption → "`Rating {r} · goes up with wins, down with losses`". Row → "`Avg wait {n} min · most games in a row: {m}`".
- [ ] **Step 4: Partner Requests.** Hint → "Pair two players on the same team for their next match. The other two spots go to whoever has waited longest." Button "Request" → "Pair Them".
- [ ] **Step 5: Buttons.**
  - "Fix score" → "Fix Score"
  - In-progress "Cancel" → "Cancel Match"
  - Wizard `addLabel` → "Add Player"
  - "Add All" → "Add All Players"
  - Header "+ New Session", Manage "+ Start a New Session" and Review "Start New Session" all become "New Session" (keep the leading "+" on the header and Manage buttons)
- [ ] **Step 6: Danger zone.** "End Session" → "End & See Results". "Reset This Session" → "Erase Results & Restart". The confirm dialogs keep their current action labels.
- [ ] **Step 7: PIN.** Replace the pin badge `title` with a visible hint under it: "Give this PIN only to people you want scoring matches."
- [ ] **Step 8: Toasts.** "Image export unavailable" → "Image export isn't supported in this browser". "Could not generate image" → "Couldn't create the image — try again".
- [ ] **Step 9: Verify.** Run `npm run build && npm run lint` and `grep -rn "title=\"" src/components`. Expected: no remaining `title=` that carries information missing from visible text. In the preview at 375px with a 30-character player name, confirm the waiting row and health strip don't scroll horizontally (`document.documentElement.scrollWidth <= 375` via `javascript_tool`). Open the Player view and confirm no Manage-only hints appear.
- [ ] **Step 10: Commit.**

```bash
git add src
git commit -m "copy: plain-language stats and actions, consistent button labels, visible PIN and break hints"
```

### Task 5: Netlify badge covers the bottom nav (audit E23, owner action)

Not a code change. The badge is injected by Netlify, not by this repo.

- [ ] **Step 1:** In the Netlify dashboard for `gobadmin`, turn off the "Powered by Netlify" badge if the plan allows it.
- [ ] **Step 2: Verify.** Open https://gobadmin.netlify.app/ at 375×812 and confirm the Rankings and Manage tabs are fully visible and tappable. If the badge can't be removed, add `padding-bottom` to the nav equal to the badge height in `BottomNav.module.css` and verify again.

## Self-Review

- Audit items 1–7 → Task 1. Items 11–14 → Task 2. Items 8–10 → Task 3. Items 15–22 → Task 4. Item 23 → Task 5. "Keep as is" is untouched.
- Tasks 3 and 4 use the Task 2 glossary: "Waiting", "not checked in", "Resting"/"Rest", "Tier".
- New fields (`balanceNote`, `manage.resultMode`, `manage.shareUrl`, `review.resultMode`, `setup.reviewHasHistory`, `matches.courtsCount`) are each defined in exactly one step.
- Review Focus: read-only tier leak → Task 1 Step 8. Zero-state wizard → Task 1 Step 7 and Task 3 Step 6. Singular counts → Task 1 Steps 1 and 7, Task 3 Step 3. Touch and screen reader → Task 3 Step 6, Task 4 Step 9. Overflow at 375px → Task 4 Step 9.
