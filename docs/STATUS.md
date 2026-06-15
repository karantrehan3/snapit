# snapit — Status & Handoff

> Living handoff doc. Read this + [`DESIGN.md`](DESIGN.md) to continue work in any session.
> Last updated: 2026-06-16 (Phase 2 recording + feature-based renderer refactor).

## What this is

A local macOS QA screenshot tool — a faithful Lightshot-style capture/annotate app,
built to later grow into screen recording, live browser-session analysis (auto-planning
Playwright tests), and assisted form-fill. See [`DESIGN.md`](DESIGN.md) for full vision,
the four-phase roadmap, and locked decisions.

- **Repo:** `…/JRNI/core/snapit` (sibling of the jrni-workspace). Own git repo, default branch
  `master`, pushed to `github.com/karantrehan3/snapit` (SSH).
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

## What's built (Phase 1 capture + annotate, Phase 2 recording)

The renderer is **feature-based**: `src/renderer/src/features/{screenshot,record,settings}/`, each
with its component(s) + hooks + `types.ts` + `styles.ts`. Cross-directory imports use the
`@renderer` / `@preload` path aliases.

- **Shell** (`src/main/index.ts`): background tray app (dock hidden), two capture modes behind
  **configurable global hotkeys** — screenshot (⌘⇧9) and record (⌘⇧8).
- **Capture** (`src/main/capture.ts`): freeze-frame of the display under the cursor at native
  (Retina) resolution via `desktopCapturer`; `getDisplaySource()` resolves a live source id for recording.
- **Editor** (`features/screenshot/`, logic in `useAnnotationEditor`): full-screen Konva stage + DOM grey veil.
  - Selection box = a window into the frozen screen; **movable** and **corner-resizable** (DOM handles).
  - Annotation tools (`Toolbar.tsx` / `shapes.tsx`): rect / circle / arrow / line / pen / text,
    selectable color (presets + custom popover), **Cmd+Scroll thickness** with a size preview,
    **move/select/delete shapes**, **rect resize** via Konva Transformer, full **undo/redo**.
  - Output: **Copy** to clipboard, **Save** (timestamped PNG), **Save As** (dialog), native resolution.
- **Settings** (`features/settings/`): tray window to edit hotkeys + save folder, persisted to
  `settings.json` in userData (`src/main/settings.ts`). Hotkey recorder shows live keycap chips
  (`useHotkeyRecorder`).
- **Recording** (`features/record/`, logic in `useRecorder`): record hotkey → setup panel
  (**source picker** for any screen/window, full-screen / region toggle, **30/60 fps**, system + mic
  audio) → `getDisplayMedia` → `MediaRecorder` → native **`.mp4`** when supported, else `.webm`.
  Region pipes the stream through a cropped canvas; system (loopback, ScreenCaptureKit) + mic audio
  mix via WebAudio. During recording the overlay is click-through with a **draggable Stop pill**; the
  record hotkey again also stops & saves. (Stop pill is visible in the recording — accepted tradeoff.)

### Commits on `master`

- `a564d9d` scaffold + screenshot/record mode split
- `b0c04da` annotation editor (movable box, shape select/move, undo/redo)
- `2b46c12` add Prettier + format all
- `296472f` resizable capture box, native shape drag, whitish veil
- `3807344` save/save-as, settings window, ellipse tool, refined hotkey recorder
- `5decd75` Phase 2 screen recording (full-screen + region, mic, Stop pill)
- `05ae091` system+mic audio, native MP4, fps selector, draggable pill
- `40d4885` recording source picker (screen / window)
- **(uncommitted)** feature-based renderer refactor + `@renderer`/`@preload` absolute imports

## ACTIVE BUG — text annotation can't be typed

Picking the **T** tool and clicking in the box creates the text box, but you can't type.
Debug logs proved the sequence: `TEXT branch` → `textarea FOCUS` → `textarea BLUR` (immediate,
not from our code) → `onBlur` → `commitEditing()` → editing nulled → empty box removed.

**Root cause:** `app.dock.hide()` makes snapit an **accessory app**; its frameless/transparent
always-on-top window **can't retain macOS key-window status**, so the textarea loses focus the
instant it gets it. (Mouse works on non-key windows; keyboard doesn't.)

**Already tried (insufficient):** removing the `'screen-saver'` alwaysOnTop level,
`app.focus({steal:true})` on ready-to-show, `webContents.focus()`, explicit textarea ref focus,
`app.setActivationPolicy('regular')` while the overlay is open, and a non-transparent (opaque)
window — the last two were reverted as they didn't fix it.

**Recommended next fix:** since activation policy and opacity didn't help, suspect the Konva canvas
mousedown stealing first-responder back. Try `preventDefault` on the stage mousedown for the text
branch and/or focusing the textarea synchronously in the same gesture; failing that, stop hiding the
dock entirely. The debug log bridge was removed — re-add a temporary focus/blur log to verify FOCUS
sticks with no immediate BLUR before testing typing.

## Pending

1. **Fix text focus** (above) — the one open blocker; the T tool creates a box you can't type into.
2. ~~Remove debug instrumentation~~ — **done** (the `window.snapit.log` bridge was removed).
3. ~~Rework the Settings hotkey recorder~~ — **done** (`useHotkeyRecorder` + live keycap chips).
4. ~~Commit Phase 1 milestone 1d~~ — **done**.
5. ~~Phase 2 screen recording~~ — **done** (source picker, region, 30/60 fps, system + mic audio,
   native MP4; recording verified working). WebCodecs + `mp4-muxer` fallback is only needed if a
   runtime lacks native MP4 recording.
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
