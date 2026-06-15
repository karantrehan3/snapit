# snapit — Status & Handoff

> Living handoff doc. Read this + [`DESIGN.md`](DESIGN.md) to continue work in any session.
> Last updated: 2026-06-15 (end of "Building Snapit - Part-1").

## What this is

A local macOS QA screenshot tool — a faithful Lightshot-style capture/annotate app,
built to later grow into screen recording, live browser-session analysis (auto-planning
Playwright tests), and assisted form-fill. See [`DESIGN.md`](DESIGN.md) for full vision,
the four-phase roadmap, and locked decisions.

- **Repo:** `…/JRNI/core/snapit` (sibling of the jrni-workspace). Own git repo, branch `main`.
- **Stack:** Electron 42 + TypeScript + electron-vite + React 19 + Konva 10. Volta-pinned **node 22**.
- **Platform:** macOS Sequoia first (cross-OS via Electron later).

## How we started

1. Grilled the idea (`/grill`) → resolved the core fault line: OS-level capture (screenshot/
   video) vs browser-level observation (test-gen/form-fill) → **one Electron app, pluggable
   modules**, with a companion Chrome extension for the browser parts (Phase 3+).
2. Chose **Electron + TS** (cross-OS, one language, mature capture/clipboard APIs), local-only
   (no cloud), Konva for annotation.
3. Wrote `DESIGN.md`, scaffolded the project, then built Phase 1 milestone-by-milestone.

## Build / dev commands

```bash
cd ../snapit            # all commands run here
npm run dev             # launch (tray app + global hotkeys)
npm run typecheck       # tsc for main + renderer
npm run build           # electron-vite build
npm run format          # prettier --write .
```

Run from the terminal; **grant Screen Recording permission to the terminal app** (the
permission belongs to the parent process). macOS quirk notes are in "Known issues".

## What's built (Phase 1 — capture + annotate)

- **Shell** (`src/main/index.ts`): background tray app (dock hidden), two capture modes behind
  **configurable global hotkeys** — screenshot (⌘⇧9) and record (⌘⇧8, a Phase-2 stub).
- **Capture** (`src/main/capture.ts`): freeze-frame of the display under the cursor at native
  (Retina) resolution via `desktopCapturer`.
- **Editor** (`src/renderer/src/ScreenshotOverlay.tsx`): full-screen Konva stage + DOM grey veil.
  - Selection box = a window into the frozen screen; **movable** and **corner-resizable** (DOM handles).
  - Annotation tools: rect / arrow / line / pen / text (`annotation/`), selectable color (presets +
    custom popover), **Cmd+Scroll thickness** with a size preview, **move/select/delete shapes**,
    **rect resize** via Konva Transformer, full **undo/redo**.
  - Output: **Copy** to clipboard, **Save** (timestamped PNG to a folder), **Save As** (dialog,
    parented to the overlay), all at native resolution.
- **Settings** (`src/renderer/src/settings/`): window from the tray to edit hotkeys + save folder,
  persisted to `settings.json` in userData (`src/main/settings.ts`).
- **Recording** (`src/renderer/src/RecordOverlay.tsx`, Phase 2): record hotkey → setup panel
  (full-screen / dragged region toggle, mic on/off) → `desktopCapturer` stream → `MediaRecorder`
  → `.webm` saved to the folder. Region pipes the stream through a cropped canvas. During recording
  the overlay goes click-through (screen stays usable) with a top-center Stop pill; the record
  hotkey pressed again also stops & saves. Mic mixes in via a second `getUserMedia`; if denied it
  records silently. (Stop pill is visible in the recording — accepted tradeoff.)

### Commits on `main`

- `a564d9d` scaffold + screenshot/record mode split
- `b0c04da` annotation editor (movable box, shape select/move, undo/redo)
- `2b46c12` add Prettier + format all
- `296472f` resizable capture box, native shape drag, whitish veil
- **(uncommitted WIP)** milestone 1d: save/save-as + settings window + dialog-parenting +
  custom color popover + accessory-app focus attempts + **debug logging** (see below)

## ACTIVE BUG — text annotation can't be typed

Picking the **T** tool and clicking in the box creates the text box, but you can't type.
Debug logs proved the sequence: `TEXT branch` → `textarea FOCUS` → `textarea BLUR` (immediate,
not from our code) → `onBlur` → `commitEditing()` → editing nulled → empty box removed.

**Root cause:** `app.dock.hide()` makes snapit an **accessory app**; its frameless/transparent
always-on-top window **can't retain macOS key-window status**, so the textarea loses focus the
instant it gets it. (Mouse works on non-key windows; keyboard doesn't.)

**Already tried (insufficient):** removing the `'screen-saver'` alwaysOnTop level,
`app.focus({steal:true})` on ready-to-show, `webContents.focus()`, explicit textarea ref focus.

**Recommended next fix:** make the app active/regular while the overlay is open —
`app.setActivationPolicy('regular')` + `app.focus({steal:true})` on overlay open, restore
`'accessory'` on close — OR stop hiding the dock. Verify with the FOCUS/BLUR logs (FOCUS should
stick, no immediate BLUR), then test typing.

## Pending

1. **Fix text focus** (above) — the blocker for finishing 1d.
2. **Remove debug instrumentation** once text works: `window.snapit.log(...)` calls in
   `ScreenshotOverlay.tsx`, the `log` method in `src/preload/index.ts`, and the `renderer:log`
   handler in `src/main/index.ts`.
3. **Rework the Settings hotkey recorder** — current click-to-record `HotkeyInput`
   (`src/renderer/src/settings/HotkeyInput.tsx`) is clunky; the user wants it nicer.
4. **Commit 1d** as "Phase 1 complete" (only after user verifies — present changes first).
5. ~~**Phase 2:** screen recording~~ — **done** (full-screen + region, mic, Stop pill). Verify the
   `getUserMedia` desktop path on Electron 42; if it errors, switch to `getDisplayMedia` +
   `setDisplayMediaRequestHandler`.
6. Later phases: Chrome extension + Playwright test-gen (Phase 3), assisted form-fill (Phase 4),
   cloud share. See `DESIGN.md`.

## Known issues / macOS notes

- **Screen Recording permission**: belongs to the launching terminal, not Electron. If capture
  is black, grant it to Terminal/iTerm and relaunch. `tccutil reset ScreenCapture com.github.Electron`
  - reboot if the grant gets stuck.
- **Electron binary download**: if a fresh `npm install` leaves "Electron uninstall", run
  `node node_modules/electron/install.js` directly.
- **NSSpellServer log spam**: disabled via `session.defaultSession.setSpellCheckerEnabled(false)`;
  confirm it's gone after the focus fix (it was worsened by the focus/blur churn).
- Bundle ~1.35MB (Konva) — fine for desktop; not a runtime cost.

## Working conventions (from the user)

- Present changes before committing; don't commit until verified.
- Don't guess on bugs — add logging and diagnose from evidence.
- Match existing style (Prettier: no semicolons, single quotes, width 110). Run `npm run format`.
- Keep comments minimal and only where they earn their place.
