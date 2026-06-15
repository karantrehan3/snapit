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

**Milestone 1c** — annotation. After drag-select, a Konva editor opens with a floating
toolbar: rect / arrow / line / pen / text, selectable color and thickness, Undo (⌘Z).
Copy exports the crop + annotations to the clipboard at native resolution; Esc/✕ cancels.
Two capture modes behind separate hotkeys: screenshot (⌘⇧9) and record (⌘⇧8, Phase 2 stub).
Next: save-to-disk + settings (1d).
