# Share Formats (Post / Story / Square) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The rankings card can be exported in three formats sized for Instagram and Threads — Post (4:5), Story (9:16) and Square (1:1) — each carrying the GoBadmin logo, picked from a format switch in the existing share modal.

**Architecture:** Today the card is one fixed 1179×1440 layout (`ShareRankingsModal`), rasterised by html2canvas in `useSessionStore.renderRankingsImage`. A `ShareFormat` registry in `src/lib/shareCard.ts` becomes the single source of every size, safe zone and top-N count; pure helpers there are unit-tested. The store holds the chosen format, the modal sizes and scales the card from it, and the 1st-place photo is re-cropped per format. The *look* of each format comes from Claude Design layouts the owner will supply (Task 5); Tasks 1–4 first make all three formats work with today's layout so the plumbing can be verified independently.

**Tech Stack:** React 18, TypeScript 5.6, Vite 5, CSS Modules, html2canvas 1.4, Vitest 2 (node environment: pure logic only, no DOM tests).

**Spec:** No separate spec doc. Requirements are the owner's request ("a format to post a story / post on Instagram and Threads, with my logo") plus the owner's follow-up ("I will drop the plans using Claude Design" — i.e. layouts arrive as Claude Design output). The existing card is the baseline: `src/components/modals/ShareRankingsModal.tsx` + `.module.css`.

## Global Constraints

- **Brand:** the group is "GoBadmin". Logo is `public/gobadmin-logo.png` (white on transparent), loaded as `` `${import.meta.env.BASE_URL}gobadmin-logo.png` `` — keep that path; html2canvas cannot recolour images. Handle in the card is `@gobadmin`.
- **Palette/fonts (unchanged):** ground `#0b1420`, accent `#ff4a1a`, panel `#101E2F`, Poppins for headings, Manrope for body.
- **Export widths:** all three formats are 1179 px wide. Heights: Post **1440**, Story **2096** (9:16 → 1179/2096 = 0.5625), Square **1179**.
- **Post must stay pixel-identical** to today's card (same row gaps 16/24/32/40, same positions).
- **Story safe zones:** keep all text and the logo clear of the top **270 px** and bottom **270 px** (Instagram's reply bar/profile strip cover ~250 px of 1920, scaled to 2096). Photo and background may bleed under them.
- **Instagram feed accepts 4:5 – 1.91:1:** Post's 1179/1440 = 0.819 must stay ≥ 0.8.
- **Top-N:** Post 8, Story 8, Square 5. Fewer ranked players than N must still lay out cleanly (0 through N).
- **html2canvas limits:** no CSS `clip-path`, `filter`, `mix-blend-mode`; slanted shapes are SVG polygons (`Shape`); text that needs the export nudge keeps `data-xfix`; the preview scales the card with a transform that the exporter removes via `data-share-frame` / `data-share-card`.
- **Text-size test** (`src/styles.test.ts`) deliberately skips `ShareRankingsModal*.css`; keep it that way. Any new CSS module for card layouts must also be excluded there (extend the `.filter`).
- **Don't touch** the owner's uncommitted edits in `src/components/tabs/RankingsTab.tsx` / `.module.css`. Commit with explicit `git add <paths>`, never `git add -A`.
- **Verification commands:** `npm test`, `npm run lint`, `npm run build` all pass before each commit.

## Review Focus

- **Stale export after switching format** — Save must export the format currently shown, never a cached blob from the previous one (`shareBlobRef` is keyed by `shareCardKey`).
- **Switching format with a photo picked** — photo is re-cropped to the new box, not stretched; Remove still works; picking a second photo after a switch uses the new format's box.
- **Fewer players than the format's top-N** (0, 1, 2) — no overlap with the footer, no crash on `top[0]`, title says "TOP n" with the real count.
- **Story footer/CTA inside the bottom safe zone** with 8 rows and with 1 row.
- **Exported PNG size equals the format size** on a narrow phone (the preview scale must not leak into the export), including the iOS "open the picture" fallback.
- **Long session names / 18-char player names** in the narrower Square and tall Story layouts — no clipped text in the PNG.
- **Early standings** ("EARLY STANDINGS") fits the title area in all formats.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/shareCard.ts` (modify) | `ShareFormat` registry, row-gap rule, vertical-fit math, export file name |
| `src/lib/shareCard.test.ts` (create) | Unit tests for the above |
| `src/lib/sharePhoto.ts` (modify) | `coverPlacement` (pure, tested) + `prepareSharePhoto(file, format)` |
| `src/lib/sharePhoto.test.ts` (create) | Tests for `coverPlacement` |
| `src/hooks/useSessionStore.ts` (modify) | Chosen format state, format-aware render/save/top-N/photo |
| `src/components/modals/ShareRankingsModal.tsx` + `.module.css` (modify) | Format switch, card sized from the format, safe-zone-aware positions |
| `src/components/modals/share/*` (Task 5, create) | One card layout component per format, from the Claude Design output |
| `src/lib/shareCaption.ts` (+ test) (Task 6, optional) | Ready-to-paste caption with hashtags for Instagram / Threads |

---

### Task 1: Format registry and layout math

**Files:**
- Modify: `src/lib/shareCard.ts`
- Create: `src/lib/shareCard.test.ts`

**Interfaces:**
- Produces (all exported from `src/lib/shareCard.ts`):
  - `type ShareFormatId = "post" | "story" | "square"`
  - `interface ShareFormat { id: ShareFormatId; label: string; hint: string; w: number; h: number; topCount: number; safeTop: number; safeBottom: number; photoW: number; photoH: number }`
  - `const SHARE_FORMATS: Record<ShareFormatId, ShareFormat>`, `const SHARE_FORMAT_ORDER: ShareFormatId[]` (`["post","story","square"]`), `const DEFAULT_SHARE_FORMAT: ShareFormatId` (`"post"`)
  - `shareRowGap(format: ShareFormat, count: number): number`
  - `shareListBottom(format: ShareFormat, count: number): number` — y of the last row's bottom edge
  - `shareFooterTop(format: ShareFormat): number` — y of the footer chip's top edge (above it nothing may be drawn)
  - `shareFileName(sessionName: string, format: ShareFormat): string`
- Keep the old `SHARE_CARD_W/H`, `SHARE_PHOTO_W/H`, `SHARE_TOP_COUNT` exports as aliases of `SHARE_FORMATS.post` until Task 4 migrates the last consumer, then delete them.

Format values:

| id | label | hint | w×h | topCount | safeTop/Bottom | photoW×H |
|---|---|---|---|---|---|---|
| post | Post | Instagram feed · Threads | 1179×1440 | 8 | 0 / 0 | 500×820 |
| story | Story | Instagram Story | 1179×2096 | 8 | 270 / 270 | 560×1100 |
| square | Square | Threads · Instagram grid | 1179×1179 | 5 | 0 / 0 | 500×700 |

Layout constants (measured from the current CSS, private to the module): `ROW_H = 78` (name bar 18+42+18), `LIST_TOP_BASE = 419` (list top 475 minus the header's 56 px top padding; the header's top padding becomes `max(56, safeTop)`), `FOOTER_H = 132` (chip top to card bottom: 86 + 46), `MIN_FOOTER_GAP = 24`.
Row gaps: Post/Square keep today's rule (≥7 → 16, ≥6 → 24, ≥4 → 32, else 40); Story is roomier (≥7 → 40, ≥6 → 44, ≥4 → 48, else 56).

- [ ] **Step 1: Write the failing tests** in `src/lib/shareCard.test.ts`:
  - `post keeps today's row gaps` — `shareRowGap(post, 8|7|6|5|4|3|1)` → `16,16,24,32,32,40,40`.
  - `every format is a valid Instagram shape` — all `w === 1179`; `post.w/post.h >= 0.8`; `Math.abs(story.w/story.h - 9/16) < 0.001`; `square.w === square.h`.
  - `the list fits above the footer for every count` — for each format and `count` in `1..topCount`: `shareListBottom(f, count) + 24 <= shareFooterTop(f)`; and `shareFooterTop(f) === f.h - f.safeBottom - 132` (so for story it is `2096 - 270 - 132`).
  - `story text starts below the top safe zone` — `shareListBottom(story, 8) - 8*78 - 7*shareRowGap(story,8)` (the list top) `>= 270`.
  - `file names` — `shareFileName("SmashMatch GoBadmin", story) === "gobadmin-rankings-story.png"`; `shareFileName("", post) === "gobadmin-rankings-post.png"`; `shareFileName("Mabar Jumat! 🏸", square) === "mabar-jumat-rankings-square.png"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/shareCard.test.ts` — Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the registry and helpers in `src/lib/shareCard.ts`. `shareFileName` moves the slug logic out of `useSessionStore.downloadRankingsImage` (strip the leading "SmashMatch" prefix with the same regex, collapse non-word runs to `-`, trim `-`, lowercase, fall back to `gobadmin`).
- [ ] **Step 4: Run** `npm test` — Expected: PASS (new tests plus the existing 100+).
- [ ] **Step 5: Commit** — `git add src/lib/shareCard.ts src/lib/shareCard.test.ts && git commit -m "feat: share format registry (post, story, square) with layout-fit math"`

---

### Task 2: Photo crop follows the format

**Files:**
- Modify: `src/lib/sharePhoto.ts`
- Create: `src/lib/sharePhoto.test.ts`

**Interfaces:**
- Consumes: `ShareFormat` (`photoW`, `photoH`) from Task 1.
- Produces:
  - `coverPlacement(imgW: number, imgH: number, boxW: number, boxH: number): { dx: number; dy: number; dw: number; dh: number }` — today's inline `object-fit: cover` maths (anchor `dy = (boxH - dh) * 0.2`, `dx` centred), extracted.
  - `prepareSharePhoto(file: File, format: ShareFormat): Promise<string>` — signature change; box = `format.photoW/H × RES`.

- [ ] **Step 1: Write the failing tests** — `coverPlacement(4000, 3000, 1000, 1640)`: `dh === 1640`, `dw > 1000`, `dx === (1000 - dw) / 2`, `dy === 0`; `coverPlacement(1000, 3000, 1000, 1640)`: `dw === 1000`, `dh > 1640`, `dy === (1640 - dh) * 0.2` (negative); result always covers the box (`dw >= boxW && dh >= boxH`).
- [ ] **Step 2: Run** `npx vitest run src/lib/sharePhoto.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `coverPlacement`, use it inside `prepareSharePhoto`, add the `format` parameter. Leave zoom/contrast/wash untouched. The only existing caller (`useSessionStore.pickSharePhoto`) is updated in Task 3; until then pass `SHARE_FORMATS.post` so the build stays green.
- [ ] **Step 4: Run** `npm test && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/sharePhoto.ts src/lib/sharePhoto.test.ts src/hooks/useSessionStore.ts && git commit -m "feat: share photo crop follows the chosen format"`

---

### Task 3: Store wiring

**Files:**
- Modify: `src/hooks/useSessionStore.ts` (sharing block ~L1106-1227, `shareRankingsTop` ~L1933, `shareCardKey` ~L1952, `shareRankings` return ~L2189)

**Interfaces:**
- Consumes: `SHARE_FORMATS`, `DEFAULT_SHARE_FORMAT`, `shareFileName`, `ShareFormat`, `ShareFormatId` (Task 1); `prepareSharePhoto(file, format)` (Task 2).
- Produces on `store.shareRankings` (the `SessionStore["shareRankings"]` type the modal destructures): `format: ShareFormat`, `onSelectFormat: (id: ShareFormatId) => void`. `top` is now sliced to `format.topCount`.

- [ ] **Step 1: State.** Add `const [shareFormatId, setShareFormatId] = useState<ShareFormatId>(DEFAULT_SHARE_FORMAT)` beside `sharePhoto`; derive `format = SHARE_FORMATS[shareFormatId]`. Not persisted with the session; survives close/reopen within the page's life.
- [ ] **Step 2: Photo.** Store the picked `File` with the prepared URL (`{ file, url, id }`). `onSelectFormat` sets the id and, if a photo exists, re-runs `prepareSharePhoto(file, newFormat)` and replaces `url` with a **new `id`** so the cache key changes. Failure → existing toast "Couldn't use that photo" and the photo is cleared.
- [ ] **Step 3: Render.** `renderRankingsImage` uses `format.w` / `format.h` in the `onclone` frame resize and lists `format` in its `useCallback` deps (this is what re-runs the pre-render effect on a format change). Add `format.id` to `shareCardKey`.
- [ ] **Step 4: Save.** `downloadRankingsImage` uses `shareFileName(state.sessionName, format)` and its share-sheet `title` stays "Rankings". `shareRankingsTop` slices to `format.topCount`.
- [ ] **Step 5: Verify** `npm test && npm run lint && npm run build` — Expected: PASS. (The hook has no unit tests; behaviour is verified in Task 4's browser step.)
- [ ] **Step 6: Commit** — `git add src/hooks/useSessionStore.ts && git commit -m "feat: share store tracks the chosen format and re-crops the photo"`

---

### Task 4: Modal — format switch and format-sized card (today's layout)

**Files:**
- Modify: `src/components/modals/ShareRankingsModal.tsx`, `src/components/modals/ShareRankingsModal.module.css`
- Modify: `src/lib/shareCard.ts` (delete the legacy aliases)

**Interfaces:**
- Consumes: `format`, `onSelectFormat`, `top`, `photo` from `store.shareRankings` (Task 3); `SHARE_FORMAT_ORDER`, `SHARE_FORMATS`, `shareRowGap` (Task 1).
- Produces: card root exposes CSS custom properties set inline from the format — `--card-w`, `--card-h`, `--photo-w`, `--photo-h`, `--safe-top`, `--safe-bottom` — which Task 5's layouts also use.

- [ ] **Step 1: Switch.** Above the card, a three-button segmented control (`role="tablist"`, 44 px tall buttons, 16 px side gutter) listing `label` with the `hint` as small text under the active one. Selecting calls `onSelectFormat(id)`.
- [ ] **Step 2: Sizing.** `.card` and `.frame` take width/height from the format (inline style / the custom properties) instead of the hard-coded 1179×1440. `usePreviewScale(format)` returns `Math.min(width / format.w, (window.innerHeight - 260) / format.h)` so Story fits on a phone without scrolling; `frame` width/height use `format.w/h * scale`.
- [ ] **Step 3: Positions.** In the CSS: header top padding `max(56px, var(--safe-top))`; `.panel` top = header top padding + 344, right = `var(--photo-w)`, bottom = `182px + var(--safe-bottom)`; `.chip` bottom `calc(86px + var(--safe-bottom))`; `.cta` bottom `calc(40px + var(--safe-bottom))`; `.photo` width/height from `--photo-w/h`; `.bar` unchanged (full-bleed). Row gap from `shareRowGap(format, top.length)` replaces the inline ternary. Title line shows `TOP ${top.length}` (already does).
- [ ] **Step 4: Delete** the legacy `SHARE_CARD_W/H`, `SHARE_PHOTO_*`, `SHARE_TOP_COUNT` aliases; fix the remaining imports.
- [ ] **Step 5: Verify in the browser** — `preview_start` `dev`, create a session with seed players, finish a few matches, open Rankings → Share. For each of Post/Story/Square: screenshot the preview; add a 1st-place photo, switch format, confirm it re-crops; tap **Open the picture** and run in the page `(() => { const i = document.querySelector('img[alt^="Top"]'); return [i.naturalWidth, i.naturalHeight]; })()` — Expected: `[1179,1440]`, `[1179,2096]`, `[1179,1179]`. Check the console for errors. Resize to 390×844 (mobile preset) and repeat for Story.
- [ ] **Step 6: Verify** `npm test && npm run lint && npm run build` — Expected: PASS. Confirm Post's screenshot matches the pre-change card.
- [ ] **Step 7: Commit** — `git add src/components/modals/ShareRankingsModal.tsx src/components/modals/ShareRankingsModal.module.css src/lib/shareCard.ts && git commit -m "feat: share modal switches between post, story and square"`

---

### Task 5: Drop in the Claude Design layouts *(blocked on the designs)*

**Files:**
- Create: `src/components/modals/share/PostCard.tsx`, `StoryCard.tsx`, `SquareCard.tsx` and one `*.module.css` each (names may follow the designs)
- Modify: `src/components/modals/ShareRankingsModal.tsx` (render the card for the active format), `src/styles.test.ts` (exclude the new `share/` CSS from the 12 px rule, same as the existing modal)

**Interfaces:**
- Consumes: the data props the modal already has (`top`, `early`, `sessionName`, `playersCount`, `matchesCompleted`, `photo`, `format`, `cardRef`). Each card component takes exactly `ShareCardProps = { format: ShareFormat; top: ShareRankingEntry[]; early: boolean; title: string; date: string; playersCount: number; matchesCompleted: number; photo: string | null; cardRef: Ref<HTMLDivElement> }` (define in `src/components/modals/share/types.ts`).

**Design brief to give Claude Design** (one design per format, using the GoBadmin Leaderboard look and the white logo):

| Format | Canvas | Keep clear | Content |
|---|---|---|---|
| Post | 1179×1440 | — | Today's card (it is already the Post design; only restyle if the new design replaces it) |
| Story | 1179×2096 | 270 px top and bottom | Logo, "TOP 8 RANKINGS" title, date · group pill, 8 rows (rank, initials, name ≤ 18 chars, win % + W–L), optional 1st-place photo, "Follow @gobadmin for the next Mabar" |
| Square | 1179×1179 | — | Same content, top 5 only |

- [ ] **Step 1:** Receive the designs; for each, note the exact positions/sizes that are *not* determined by the brief and record them in this task before coding.
- [ ] **Step 2:** For each format, move the layout out of `ShareRankingsModal.tsx` into its card component and restyle to the design. Every rule in Global Constraints applies (SVG `Shape`s, `data-xfix`, no clip-path/filter/blend, logo from `BASE_URL`).
- [ ] **Step 3:** Add each format's fit test to `shareCard.test.ts` if the design changes row height, header height or footer height (update `ROW_H`, `LIST_TOP_BASE`, `FOOTER_H` and the tests together).
- [ ] **Step 4:** Repeat Task 4 Step 5's browser checks for each format against the design image side by side; check 0, 1, 2 and `topCount` players, the early-standings title, and an 18-character name.
- [ ] **Step 5:** `npm test && npm run lint && npm run build` — Expected: PASS.
- [ ] **Step 6: Commit** — `git add src/components/modals src/styles.test.ts src/lib && git commit -m "feat: Claude Design layouts for the post, story and square cards"`

---

### Task 6 (optional): Copy caption for Instagram / Threads

**Files:**
- Create: `src/lib/shareCaption.ts`, `src/lib/shareCaption.test.ts`
- Modify: `src/components/modals/ShareRankingsModal.tsx`, `src/hooks/useSessionStore.ts` (expose `onCopyCaption`)

**Interfaces:**
- Produces: `buildCaption(input: { title: string; date: string; top: { rank: number; name: string; winPct: number }[]; early: boolean }): string` — ≤ 500 characters (Threads' limit) for 8 entries of 18-character names.

- [ ] **Step 1: Write the failing tests** — for `title "GoBadmin"`, `date "3 Oct 2026"`, top `[{rank:1,name:"Rina",winPct:100},{rank:2,name:"Budi",winPct:75}]`: result starts `"🏆 Mabar · 3 Oct 2026 · GoBadmin\n🥇 Rina — 100%\n🥈 Budi — 75%"`, ends `"Follow @gobadmin for the next Mabar 🏸\n#badminton #gobadmin #mabar"`; rank 4+ uses `"4. Name — 50%"`; `early: true` starts `"⏱️ Early standings · …"`; eight 18-char names → `length <= 500`.
- [ ] **Step 2: Run** `npx vitest run src/lib/shareCaption.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `buildCaption`; add a "Copy caption" button next to Save Image that writes it with `navigator.clipboard.writeText` and shows the toast "Caption copied" (failure: "Couldn't copy").
- [ ] **Step 4: Run** `npm test && npm run build` — Expected: PASS. Click the button in the preview and confirm the toast.
- [ ] **Step 5: Commit** — `git add src/lib/shareCaption.ts src/lib/shareCaption.test.ts src/components/modals/ShareRankingsModal.tsx src/hooks/useSessionStore.ts && git commit -m "feat: copy a ready-made caption for Instagram and Threads"`

---

## Self-review notes

- **Coverage:** formats/sizes/safe zones → T1, T4; logo on every format → kept in T4 baseline and T5 brief; photo per format → T2/T3; stale export → T3 Step 3 (`format` in deps + key); Claude Design hand-off → T5; Threads → covered by Post (feed) and Square formats plus the caption (T6).
- **Type names** are consistent across tasks: `ShareFormat`, `ShareFormatId`, `SHARE_FORMATS`, `SHARE_FORMAT_ORDER`, `shareRowGap`, `shareListBottom`, `shareFooterTop`, `shareFileName`, `coverPlacement`, `prepareSharePhoto(file, format)`, `onSelectFormat`.
- **Open items:** Task 5 cannot be finalised until the designs exist; Task 6 is droppable.

---

**Follow-up plan:** a Post Studio for any photo or video (logo and editable strip, sized for Instagram and Threads) is in `docs/superpowers/plans/2026-10-03-branded-media.md`. It needs only Task 1 of this plan.
