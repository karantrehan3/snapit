# snapit

A local QA tool. Phase 1 is a faithful, cross-OS, Lightshot-style screenshot tool;
later phases add screen recording, live browser-session analysis that auto-plans
integration tests, and assisted form-fill.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full design, decisions, and roadmap.

## Stack

Electron + TypeScript + electron-vite, with a React + Konva annotation canvas.
macOS-first, cross-OS via Electron.

## Develop

```bash
npm install
npm run dev          # launch the app (tray + global hotkey)
npm run typecheck    # type-check main, preload, and renderer
npm run build        # bundle main/preload/renderer
```

The global capture hotkey is **Cmd/Ctrl + Shift + 9** — it opens the capture overlay;
Esc dismisses it.

> macOS: grant **Screen Recording** permission on first use, or captures return black
> frames (needed from milestone 1b onward).

## Status

**Phase 1 complete (1a–1d).** Background tray app, two capture modes behind
configurable hotkeys (screenshot ⌘⇧9, record ⌘⇧8 — Phase 2 stub). Screenshot flow:
freeze → drag-select (resizable box) → annotate (rect/arrow/line/pen/text, color +
Cmd+Scroll thickness, undo/redo) → **Copy**, **Save** (default folder), or **Save As…**
(dialog). Settings window (from the tray) edits hotkeys + save folder, persisted to
`settings.json` in userData.

Next: **Phase 2** — wire real screen recording into the record-mode stub.
