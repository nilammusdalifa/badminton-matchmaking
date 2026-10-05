# Post Studio (any photo or video + GoBadmin branding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Post Studio" in the app where the owner picks **any photo or video** from their phone (a group photo, a rally clip, a trophy shot — not only rankings), the app adds the GoBadmin logo and an editable "Mabar · date · group" strip, and exports a JPEG (photo) or MP4 (video) sized for an Instagram Story/Reel, Instagram post, or Threads — all on the phone, nothing uploaded.

**Architecture:** Pure helpers (`src/lib/shareMedia.ts`) own sizes, crop maths, trimming and codec choice and are unit-tested. One transparent overlay (a DOM component, captured once with html2canvas like the rankings card) serves both media. A browser-only photo renderer draws photo + overlay onto a canvas and exports a JPEG; a browser-only video engine plays the clip into a canvas, draws the overlay on every frame and records canvas + the clip's audio with `MediaRecorder` (real-time: a 30 s clip takes ~33 s). A new hook `usePostStudio` and modal `PostStudioModal` hold all studio state, independent of the rankings modal and of any session data.

**Tech Stack:** React 18, TypeScript 5.6, Vite 5, html2canvas 1.4 (already installed), browser `MediaRecorder` + `AudioContext`, Vitest 2 (node environment: pure logic only). **No new dependencies.**

**Spec:** No separate spec doc. Requirements are the owner's: stories and posts on Instagram/Threads are photos *and* video; the owner posts all kinds of photos and videos, not only top rankings; chosen option is "branded overlay on my own media". Depends only on Task 1 of `docs/superpowers/plans/2026-10-03-share-formats.md` (the `ShareFormat` registry, `SHARE_FORMATS`, `shareFileName`); it does not need that plan's modal changes.

## Global Constraints

- **Output sizes, photos and videos alike (even numbers only — H.264 requires them):** Story/Reel 1080×1920, Post 1080×1350, Square 1080×1080. Video 30 fps. Not the 1179-wide card sizes.
- **Photos:** exported as JPEG at quality `0.92`. EXIF rotation is honoured (phone portrait photos come out upright). A photo smaller than the frame is scaled up, never rejected.
- **Video container:** Instagram and Threads accept MP4/MOV; WebM is not reliably accepted and iOS can't save it. Prefer MP4 from `MediaRecorder`; if the browser can only record WebM, still export but show: "This browser saves WebM, which Instagram may reject. Use Chrome or Safari."
- **Video limits:** clips shorter than 1 s are refused; longer than 60 s are trimmed to the first 60 s with a visible note.
- **Independent of rankings and of the session:** the studio works with no players, no matches and no running session. The strip text defaults to `Mabar · {date} · {group}` (same wording and `shortName`-free group name as the rankings card) but is **editable (max 40 characters)**, and an empty text **hides the strip**. The logo is always drawn.
- **Entry points:** a "Post Studio" button in the Manage tab and on the end-of-session Review screen. The read-only Player view has no Manage tab and gets none.
- **Story safe zone:** logo and strip stay inside 250 px from the top and 250 px from the bottom of the 1080×1920 frame (Instagram's UI covers ~250 px). Post/Square have no safe zone.
- **Privacy:** picked media and exported files stay on the device — never written to Firebase, localStorage or the session; object URLs are revoked when the studio closes, the media is cleared or an export is cancelled.
- **Branding:** logo `public/gobadmin-logo.png` via `` `${import.meta.env.BASE_URL}gobadmin-logo.png` `` (white on transparent); palette `#0b1420` / `#ff4a1a` / `#101E2F`; Poppins + Manrope.
- **html2canvas limits (overlay is captured with it):** no `clip-path`, `filter`, `mix-blend-mode`; slants as SVG polygons; `data-xfix` on text; captured with `backgroundColor: null` so it is transparent.
- **Text-size test** (`src/styles.test.ts`) skips share CSS; extend its `.filter` for the new `ShareMediaOverlay` module. `PostStudioModal.module.css` is ordinary UI and **is** subject to the 12 px minimum and 44 px tap targets.
- **Keep `useSessionStore.ts` from growing:** studio state lives in its own hook file.
- **Don't touch** the owner's uncommitted edits in `src/components/tabs/RankingsTab.*`. Commit with explicit `git add <paths>`.
- **Verification commands:** `npm test`, `npm run lint`, `npm run build` pass before each commit.
- **Not verified when this plan was written:** which codecs `MediaRecorder` offers on the owner's phone. Task 3 Step 5 and Task 5 Step 7 check it on the real device; `pickRecorderMime` is data-driven.

## Review Focus

- **Landscape media into a 9:16 frame** — "Fill" crops the sides, "Fit" letterboxes on `#0b1420`; neither stretches. Phone-recorded portrait `.mov` and portrait photos (EXIF rotation) come out upright.
- **A 12 MP+ photo and a long 4K clip** on a mid-range phone — no out-of-memory crash; if the clip stutters the export still finishes.
- **Strip text:** empty hides the strip; 40 characters of wide letters (`WWWW…`) and an emoji fit inside the frame without clipping in the exported file.
- **No session at all** (first run, zero players) — the studio opens and exports; default text falls back to "Mabar · {date} · GoBadmin" when the session has no name.
- **Clip with no audio track** — export completes, silent; clip with audio keeps it.
- **Screen locks or tab goes to background mid-export** — the recorder would stall; abort with "Keep this screen open while the video is made" instead of a truncated file.
- **Cancel mid-export / close the studio mid-export** — recorder, audio context, video element and object URLs are all released.
- **Unplayable or wrong file** (HEVC the browser can't decode, a text file renamed `.mp4`/`.jpg`) — a readable message, no hang.
- **Exactly 60 s, 61 s, 0.9 s clips** and a stream whose `duration` is `Infinity`.
- **Switching format or Photo ↔ Video** — the chosen photo and clip are each kept; stale results are discarded and never saved by mistake.
- **Picking the same file twice in a row** still fires (reset the input value).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/shareCard.ts` (modify) | export `shareSlug(sessionName)` (from `shareFileName`) and `groupTitle(sessionName)` (from `ShareRankingsModal`'s private `cardTitle`) |
| `src/lib/shareMedia.ts` (create) | sizes, limits, crop rect, trimming, codec choice, default strip text, file names — all pure |
| `src/lib/shareMedia.test.ts` (create) | unit tests for the above |
| `src/lib/photoRender.ts` (create) | `renderBrandedPhoto` — photo + overlay → JPEG (browser only) |
| `src/lib/videoRender.ts` (create) | `renderBrandedVideo` — canvas + MediaRecorder engine (browser only) |
| `src/components/modals/ShareMediaOverlay.tsx` + `.module.css` (create) | transparent overlay (logo + optional strip) at output size |
| `src/hooks/usePostStudio.ts` (create) | all studio state and actions |
| `src/components/modals/PostStudioModal.tsx` + `.module.css` (create) | the studio UI |
| `src/App.tsx`, `src/components/tabs/ManageTab.tsx`, `src/components/ReviewScreen.tsx` (modify) | mount the modal; add the entry buttons |
| `src/components/modals/ShareRankingsModal.tsx` (modify) | import `groupTitle` instead of its private copy |

---

### Task 1: Media helpers (pure, tested)

**Files:**
- Modify: `src/lib/shareCard.ts`, `src/components/modals/ShareRankingsModal.tsx`
- Create: `src/lib/shareMedia.ts`, `src/lib/shareMedia.test.ts`

**Interfaces:**
- Consumes: `ShareFormat`, `ShareFormatId`, `SHARE_FORMATS`, `shareFileName` from the share-formats plan Task 1.
- Produces:
  - in `shareCard.ts`: `shareSlug(sessionName: string): string` (lowercase, dash-separated, "SmashMatch"-prefix-stripped, `""` when nothing is left; `shareFileName` now calls it, behaviour unchanged); `groupTitle(sessionName: string): string` (today's `cardTitle`: strips a leading "SmashMatch" and separators, falls back to the original name when nothing is left).
  - in `shareMedia.ts`:
    - `const SHARE_MEDIA_SIZE: Record<ShareFormatId, { w: number; h: number }>` (post 1080×1350, story 1080×1920, square 1080×1080)
    - `const PHOTO_JPEG_QUALITY = 0.92`, `VIDEO_FPS = 30`, `MIN_CLIP_SECONDS = 1`, `MAX_CLIP_SECONDS = 60`, `STRIP_MAX_CHARS = 40`
    - `type FitMode = "cover" | "contain"`
    - `coverRect(srcW: number, srcH: number, dstW: number, dstH: number, mode: FitMode): { dx: number; dy: number; dw: number; dh: number }` — centred on both axes
    - `trimmedSeconds(durationSeconds: number): number` — `min(duration, 60)`
    - `clipProblem(durationSeconds: number): string | null`
    - `pickRecorderMime(isSupported: (mime: string) => boolean): { mime: string; ext: "mp4" | "webm" } | null`
    - `defaultStripText(sessionName: string, date: Date): string` → `"Mabar · {d MMM yyyy, en-GB} · {groupTitle(sessionName) || "GoBadmin"}"`
    - `stripLabel(text: string): string` — collapses whitespace, trims, caps at 40 characters; `""` hides the strip
    - `photoFileName(sessionName: string, format: ShareFormat): string`, `videoFileName(sessionName: string, format: ShareFormat, ext: "mp4" | "webm"): string`

- [ ] **Step 1: Write the failing tests** in `src/lib/shareMedia.test.ts`:
  - `coverRect(1920,1080,1080,1920,"cover")` → `dh === 1920`, `dw ≈ 3413.33`, `dx ≈ (1080 - dw) / 2`, `dy === 0`.
  - `coverRect(1920,1080,1080,1920,"contain")` → `dw === 1080`, `dh === 607.5`, `dx === 0`, `dy === (1920 - 607.5) / 2`.
  - `coverRect(1080,1920,1080,1920,"cover")` → `{dx:0,dy:0,dw:1080,dh:1920}`; `coverRect(1080,1920,1080,1080,"cover")` → `dw === 1080`, `dh === 1920`, `dy === -420`; `coverRect(200,100,1080,1920,"cover")` scales **up** (`dh === 1920`).
  - `trimmedSeconds(12.5) === 12.5`, `trimmedSeconds(90) === 60`.
  - `clipProblem(0.9)`, `clipProblem(NaN)`, `clipProblem(Infinity)` each return a non-empty string; `clipProblem(1)`, `clipProblem(60)`, `clipProblem(300)` return `null`.
  - `pickRecorderMime(() => true)?.ext === "mp4"`; `pickRecorderMime((m) => m.startsWith("video/webm"))?.ext === "webm"`; `pickRecorderMime(() => false) === null`; the returned `mime` is one the predicate accepted (record the calls).
  - `defaultStripText("SmashMatch GoBadmin", new Date(2026, 9, 3)) === "Mabar · 3 Oct 2026 · GoBadmin"`; `defaultStripText("", new Date(2026, 9, 3)) === "Mabar · 3 Oct 2026 · GoBadmin"`.
  - `stripLabel("   Final   day!  ") === "Final day!"`; `stripLabel("") === ""`; `stripLabel("x".repeat(60)).length === 40`.
  - `groupTitle("SmashMatch GoBadmin") === "GoBadmin"`; `groupTitle("SmashMatch") === "SmashMatch"`; `groupTitle("Three Code") === "Three Code"`.
  - `videoFileName("SmashMatch GoBadmin", SHARE_FORMATS.story, "mp4") === "gobadmin-video-story.mp4"`; empty name + post + webm → `"gobadmin-video-post.webm"`; `photoFileName("SmashMatch GoBadmin", SHARE_FORMATS.story) === "gobadmin-photo-story.jpg"`; `photoFileName("Mabar Jumat! 🏸", SHARE_FORMATS.square) === "mabar-jumat-photo-square.jpg"`.
  - The `shareFileName` tests from the share-formats plan still pass.
- [ ] **Step 2: Run** `npx vitest run src/lib/shareMedia.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the above. MIME preference order: `video/mp4;codecs=avc1.640028,mp4a.40.2`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm`. In `ShareRankingsModal.tsx` delete the private `cardTitle` and import `groupTitle`.
- [ ] **Step 4: Run** `npm test && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/shareCard.ts src/lib/shareMedia.ts src/lib/shareMedia.test.ts src/components/modals/ShareRankingsModal.tsx && git commit -m "feat: media helpers for the Post Studio — sizes, crop, trimming, codec, strip text"`

---

### Task 2: The photo renderer

**Files:**
- Create: `src/lib/photoRender.ts`

**Interfaces:**
- Consumes: `SHARE_MEDIA_SIZE`, `coverRect`, `FitMode`, `PHOTO_JPEG_QUALITY` (Task 1); `ShareFormat`.
- Produces:
  - `interface BrandedPhotoInput { file: File; format: ShareFormat; fit: FitMode; overlay: Blob }` (`overlay` is the transparent overlay PNG the studio captures, Task 4/5)
  - `readPhotoInfo(file: File): Promise<{ width: number; height: number }>` — decodes upright (EXIF applied); rejects with `Error("That file isn't a photo")`
  - `renderBrandedPhoto(input: BrandedPhotoInput): Promise<Blob>` — a JPEG `Blob`

Behaviour: canvas is `SHARE_MEDIA_SIZE[format.id]`; fill `#0b1420`; draw the photo with `coverRect(img.naturalWidth, img.naturalHeight, w, h, fit)`; draw the overlay at `0,0,w,h`; `canvas.toBlob(..., "image/jpeg", PHOTO_JPEG_QUALITY)`. Decode via `<img>` + `decode()` (browsers apply EXIF rotation to `<img>`; `createImageBitmap` differs between browsers). Release the object URL in a `finally`.

- [ ] **Step 1: Implement** the module (no unit test: canvas isn't available in Vitest's node environment; the crop maths is tested in Task 1).
- [ ] **Step 2: Run** `npm run lint && npm run build` — Expected: PASS.
- [ ] **Step 3: Verify in the browser** — `preview_start` `dev`. In the page console make a 4000×3000 landscape test image on a canvas (`toBlob` → `File`) and a 1080×1920 transparent overlay PNG with a white rectangle at the top-left, then `const m = await import('/src/lib/photoRender.ts'); const out = await m.renderBrandedPhoto({ file, format: <story>, fit: 'cover', overlay })`. Expected: `out.type === 'image/jpeg'`; loaded into an `Image`, `naturalWidth === 1080`, `naturalHeight === 1920`; drawing it onto a canvas, the pixel at `(10,10)` is near white. With `fit: 'contain'` the pixel at `(540, 10)` is `#0b1420` (letterbox).
- [ ] **Step 4: Verify the failure path:** a text file renamed `.jpg` → `readPhotoInfo` rejects within 5 s with "That file isn't a photo".
- [ ] **Step 5: Commit** — `git add src/lib/photoRender.ts && git commit -m "feat: render any photo with the GoBadmin overlay as a JPEG"`

---

### Task 3: The video engine

**Files:**
- Create: `src/lib/videoRender.ts`

**Interfaces:**
- Consumes: `SHARE_MEDIA_SIZE`, `coverRect`, `FitMode`, `trimmedSeconds`, `pickRecorderMime`, `VIDEO_FPS` (Task 1); `ShareFormat`.
- Produces:
  - `interface BrandedVideoInput { file: File; format: ShareFormat; fit: FitMode; overlay: Blob; onProgress: (fraction: number) => void; signal: AbortSignal }`
  - `type VideoExportErrorCode = "unplayable" | "unsupported" | "hidden" | "aborted"`; `class VideoExportError extends Error { code: VideoExportErrorCode }`
  - `renderBrandedVideo(input: BrandedVideoInput): Promise<{ blob: Blob; ext: "mp4" | "webm" }>`
  - `readClipInfo(file: File): Promise<{ duration: number; width: number; height: number }>` — metadata only; rejects with `VideoExportError("unplayable")`

Behaviour (decisions the code must follow):
- Canvas is `SHARE_MEDIA_SIZE[format.id]`. Each frame: fill `#0b1420`; draw the clip with `coverRect(video.videoWidth, video.videoHeight, w, h, fit)`; draw the overlay at `0,0,w,h`.
- The recording ends when `video.currentTime >= trimmedSeconds(video.duration)` or the clip ends. `onProgress(currentTime / trimmedSeconds(duration))`.
- Audio: `AudioContext.createMediaElementSource(video)` → `createMediaStreamDestination()`, **not** connected to the speakers; add that stream's audio track to the canvas stream. Works without an audio track.
- Recorder: `MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })` using `pickRecorderMime(MediaRecorder.isTypeSupported)`; `null` → `VideoExportError("unsupported")`.
- `document.visibilitychange` to hidden, or `signal.abort()`, stops everything and rejects (`"hidden"` / `"aborted"`). Tracks stopped, `AudioContext` closed, object URLs revoked in a `finally`.

- [ ] **Step 1: Implement** the module as specified (no unit test — `MediaRecorder` isn't available under Vitest's node environment).
- [ ] **Step 2: Run** `npm run lint && npm run build` — Expected: PASS.
- [ ] **Step 3: Verify in the browser** — in the page console build a 3 s synthetic clip (canvas `captureStream` + `MediaRecorder` into a `File`) and a 1080×1920 transparent overlay PNG, then `const m = await import('/src/lib/videoRender.ts'); const r = await m.renderBrandedVideo({ file, format: <story>, fit: 'cover', overlay, onProgress: console.log, signal: new AbortController().signal })`. Expected: resolves; `r.blob.size > 0`; loaded into a `<video>`: `videoWidth === 1080`, `videoHeight === 1920`, `duration` within ±0.5 s of 3 (WebM from `MediaRecorder` may report `Infinity` — then seek to the end to measure).
- [ ] **Step 4: Verify the failure paths in the same console:** a text file renamed `.mp4` rejects with `"unplayable"` within 5 s; `abort()` after 1 s rejects with `"aborted"` and `document.querySelectorAll('video').length` is unchanged afterwards.
- [ ] **Step 5: Record which MIME the browser picked** (`r.ext`) in the commit message body.
- [ ] **Step 6: Commit** — `git add src/lib/videoRender.ts && git commit -m "feat: render any clip with the GoBadmin overlay in the browser"`

---

### Task 4: Overlay layout (baseline)

**Files:**
- Create: `src/components/modals/ShareMediaOverlay.tsx`, `src/components/modals/ShareMediaOverlay.module.css`
- Modify: `src/styles.test.ts` (exclude `ShareMediaOverlay` from the 12 px rule, like `ShareRankingsModal`)

**Interfaces:**
- Consumes: `SHARE_MEDIA_SIZE`, `ShareFormat`, `stripLabel` (Task 1).
- Produces: `ShareMediaOverlay(props: { format: ShareFormat; strip: string; overlayRef: Ref<HTMLDivElement> })` — a `div` of exactly `SHARE_MEDIA_SIZE[format.id]` pixels, transparent background; renders the strip only when `stripLabel(strip) !== ""`.

Baseline layout (placeholder until Task 6): logo top-left, 200 px wide, at `top: 250px` (story) or `56px` (post/square), `left: 56px`; a bottom strip — a skewed `#ff4a1a` pill with the strip text, uppercase — at `bottom: 250px` (story) or `56px` (others); a 12 px `#ff4a1a` bar along the very bottom edge. A soft navy→transparent gradient behind the logo and behind the pill keeps text legible on bright media (plain `linear-gradient` only). The pill is `white-space: nowrap`; its text scales down with `font-size` steps for strings over 28 characters so 40 characters fit the frame width.

- [ ] **Step 1: Implement** the component and CSS as described, reusing the `Shape` approach from `ShareRankingsModal.tsx` if the slant is wanted (lift `Shape` into its own file only if both need it).
- [ ] **Step 2: Verify** — mount it temporarily in the preview at each format's size over a bright and a dark backdrop, with a short, a 40-character and an empty strip; nothing but the edge bar sits inside the story's 250 px zones. Remove the temporary mount.
- [ ] **Step 3: Run** `npm test && npm run lint && npm run build` — Expected: PASS.
- [ ] **Step 4: Commit** — `git add src/components/modals/ShareMediaOverlay.tsx src/components/modals/ShareMediaOverlay.module.css src/styles.test.ts && git commit -m "feat: studio overlay layout — logo, editable strip, safe zones"`

---

### Task 5: The studio — hook, modal and entry points

**Files:**
- Create: `src/hooks/usePostStudio.ts`, `src/components/modals/PostStudioModal.tsx`, `src/components/modals/PostStudioModal.module.css`
- Modify: `src/App.tsx`, `src/components/tabs/ManageTab.tsx` (+ its `.module.css` if needed), `src/components/ReviewScreen.tsx`

**Interfaces:**
- Consumes: Task 1 helpers; `renderBrandedPhoto`, `readPhotoInfo` (Task 2); `renderBrandedVideo`, `readClipInfo`, `VideoExportError` (Task 3); `ShareMediaOverlay` (Task 4); `ShareFormatId`, `SHARE_FORMATS`, `SHARE_FORMAT_ORDER`, `DEFAULT_SHARE_FORMAT` (share-formats plan Task 1).
- Produces:
  - `usePostStudio(sessionName: string): PostStudio` where `PostStudio = { open: boolean; onOpen(): void; onClose(): void; kind: "photo" | "video"; onSetKind(k): void; format: ShareFormat; onSelectFormat(id: ShareFormatId): void; fit: FitMode; onSetFit(fit: FitMode): void; strip: string; onSetStrip(text: string): void; media: { name: string; detail: string; trimmed: boolean } | null; onPick(file: File): void; onClear(): void; progress: number | null; result: { url: string; kind: "photo" | "video"; fileName: string; ext: "jpg" | "mp4" | "webm" } | null; message: string | null; onCreate(): void; onCancel(): void; onSave(): void }` — the studio keeps **its own** format state (default `DEFAULT_SHARE_FORMAT`), independent of the rankings modal's.
  - `PostStudioModal(props: PostStudio)`.
  - `ManageTab` and `ReviewScreen` each gain `onOpenPostStudio: () => void`.

- [ ] **Step 1: State** in `usePostStudio`: one picked `File` per kind (photo and clip are kept separately, so switching the kind doesn't lose either), `fit` default `"cover"`, `strip` initialised by `defaultStripText(sessionName, new Date())` and **re-initialised only if the owner hasn't edited it** when `sessionName` changes, `progress`, `result`, `message`, and an `AbortController` ref. `onClose` aborts a running export, revokes `result.url`, clears picked files and messages. Nothing is persisted.
- [ ] **Step 2: Picking.** Photo: `readPhotoInfo`, `detail` = `"{w}×{h}"`; clip: `readClipInfo` then `clipProblem(duration)`, `detail` = seconds, `trimmed = duration > 60`. A failure sets `message` ("That file isn't a photo" / the `clipProblem` text / "This browser can't play that video.") and keeps the previous pick.
- [ ] **Step 3: Creating.** `onCreate` captures the overlay once into a transparent PNG blob (`html2canvas`, `backgroundColor: null`, `scale: 1`, awaiting `document.fonts.ready` and two animation frames first, as `renderRankingsImage` does) from an off-screen `ShareMediaOverlay` (`strip` passed through `stripLabel`), then calls `renderBrandedPhoto` or `renderBrandedVideo`. `VideoExportError` → `message`: `hidden` → "Keep this screen open while the video is made."; `unsupported` → "This browser can't make videos."; `aborted` → none. Changing `format`, `fit` or `strip` discards `result` (revoking its URL) and keeps the picks.
- [ ] **Step 4: Saving.** `onSave` follows `downloadRankingsImage`'s pattern in `useSessionStore.ts`: `navigator.canShare({files:[file]})` → `navigator.share`; else (iOS without file sharing, photo) show the result `<img>` for press-and-hold; else an `<a download>` click. File names from `photoFileName` / `videoFileName`. After saving, `message` = "Photo saved" / "Video saved".
- [ ] **Step 5: Modal UI** (`PostStudioModal`, backdrop and sizing like `ShareRankingsModal`, 44 px tap targets, 12 px+ text): a **Photo | Video** switch; the format switch (Post · Story · Square, with the same hints as the rankings modal); **Choose photo** / **Choose video** (hidden `input accept="image/*"` / `"video/*"`, value reset after each pick); the chosen name + detail (+ "Trimmed to 60 s"); a **Fill | Fit** switch; a "Strip text" input (16 px font, `maxLength={40}`, clear button) with the hint "Leave empty for no strip"; **Create photo** / **Create video** (disabled until media is picked); while running a progress bar with "Keep this screen open" and **Cancel**; then the result as `<img>` or `<video controls playsInline>` with **Save photo/video**; the WebM note when `result.ext === "webm"`; `message` as a status line (`aria-live="polite"`); **Close**. Before a result exists the preview is the picked media drawn at the format's aspect ratio with the overlay on top (an `<img>`/`<video muted>` stack with `object-fit` from `fit`, scaled to fit the screen height like the rankings card preview).
- [ ] **Step 6: Wire in.** `App.tsx` calls `usePostStudio(store.shareRankings.sessionName)`, renders `<PostStudioModal {...studio} />` in both the review-mode and the main return (next to `ShareRankingsModal`), and passes `studio.onOpen` as `onOpenPostStudio` to the Manage tab and the Review screen (find where each is rendered); add a "Post Studio" button to each (Manage: in the share section near "Copy live link"; Review: beside "Share Rankings").
- [ ] **Step 7: Verify in the browser** at 390×844 (mobile preset), for each format, with the synthetic photo (Task 2 Step 3) and clip (Task 3 Step 3) loaded through the real file input (or the Chrome extension's `file_upload` if the built-in browser can't set it): the saved photo is 1080×1920 / 1080×1350 / 1080×1080 with the overlay; the video plays at those sizes; Fill vs Fit; empty strip hides it; a 40-character strip fits; cancel mid-export; close mid-export; text file renamed `.jpg` and `.mp4`; a 0.5 s clip; Photo ↔ Video keeps both picks; the studio opens on a fresh install with no players. Console shows no errors.
- [ ] **Step 8: Verify on the owner's phone** (the one real-device gate): make a Story photo from a portrait phone photo (comes out upright) and a Story video from a 10 s portrait clip; share both to Instagram and confirm they upload without a "file not supported" message and that the logo and strip sit clear of Instagram's UI.
- [ ] **Step 9: Run** `npm test && npm run lint && npm run build` — Expected: PASS (the 12 px and tap-target tests include the new modal CSS).
- [ ] **Step 10: Commit** — `git add src/hooks/usePostStudio.ts src/components/modals/PostStudioModal.tsx src/components/modals/PostStudioModal.module.css src/App.tsx src/components/tabs/ManageTab.tsx src/components/tabs/ManageTab.module.css src/components/ReviewScreen.tsx && git commit -m "feat: Post Studio — brand any photo or video for Instagram and Threads"` (drop paths that were not changed).

---

### Task 6: Drop in the Claude Design overlay *(blocked on the designs)*

**Files:**
- Modify: `src/components/modals/ShareMediaOverlay.tsx` + `.module.css`

**Interfaces:** unchanged from Task 4 — same props, same output size.

**Design brief to give Claude Design:** three transparent-background overlay layouts (1080×1920 Story/Reel, 1080×1350 Post, 1080×1080 Square) in the GoBadmin look, to sit on top of the owner's own photos and footage of any kind: the white GoBadmin logo, one editable strip (shown as "MABAR · 3 OCT 2026 · THREE CODE": orange skewed pill), a thin orange edge bar, plus the strip-less variant. Story: nothing inside the top 250 px or bottom 250 px. Legible over bright and dark media. No clip-path, filter or blend modes; solid colours and simple gradients only.

- [ ] **Step 1:** Receive the designs and record any position/size the brief didn't fix here before coding.
- [ ] **Step 2:** Restyle `ShareMediaOverlay` to match; keep the 250 px story safe zone and the strip-empty and 40-character cases.
- [ ] **Step 3:** Repeat Task 4 Step 2's screenshots and Task 5 Step 7's run-through for each format against the design images.
- [ ] **Step 4:** `npm test && npm run lint && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/components/modals/ShareMediaOverlay.tsx src/components/modals/ShareMediaOverlay.module.css && git commit -m "feat: Claude Design overlay for the Post Studio"`

---

## Self-review notes

- **Coverage:** any photo → T2/T5; any video → T3/T5; logo + editable strip → T4/T5; works without rankings/session → T5 (own hook, own format state, default text fallback); Story/Post/Square sizes → T1; entry points → T5 Step 6; real-device and Instagram acceptance → T5 Step 8; designs → T6.
- **Type names** are consistent across tasks: `SHARE_MEDIA_SIZE`, `FitMode`, `coverRect`, `trimmedSeconds`, `clipProblem`, `pickRecorderMime`, `defaultStripText`, `stripLabel`, `photoFileName`, `videoFileName`, `shareSlug`, `groupTitle`, `renderBrandedPhoto`, `readPhotoInfo`, `renderBrandedVideo`, `readClipInfo`, `VideoExportError`, `ShareMediaOverlay`, `usePostStudio`, `PostStudio`, `PostStudioModal`, `onOpenPostStudio`.
- **Removed from the earlier draft:** the rankings end screen for videos. A general studio shouldn't depend on the rankings card being rendered; it can be added later as an option when rankings exist.
- **Known trade-off:** video export is real-time (clip length) and needs the screen on. An offline encoder (WebCodecs + a muxer library) would remove both limits but adds a dependency and a larger plan; revisit if waits annoy.
- **Open items:** Task 6 waits for the designs; MP4 availability from `MediaRecorder` is confirmed only in Task 3 Step 5 / Task 5 Step 8.
