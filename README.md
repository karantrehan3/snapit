<p align="center">
  <img src="build/icon.png" alt="snapit" width="128" height="128" />
</p>

<h1 align="center">snapit</h1>

<p align="center">
  A fast, local-only screenshot &amp; screen-recording tool for QA — Lightshot-style capture,
  on-image annotation, and one-key recording, all from the menu bar.
</p>

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-555" />
  <img alt="electron" src="https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white" />
  <img alt="react" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

## Demo

<!-- TODO: record a short capture → annotate → copy/record clip (snapit snapping itself!),
     save it as docs/demo.gif, and uncomment:
<p align="center"><img src="docs/demo.gif" alt="snapit in action" width="760" /></p> -->

> 🎬 _A short demo GIF is on the way — snapit, snapping itself._

## What it is

**snapit** is a desktop tray app that lives in your menu bar and gives you two capture modes
behind global hotkeys:

- **Screenshot** (`⌘⇧9`) — freeze the screen, drag a resizable selection box, annotate it, then
  copy or save.
- **Record** (`⌘⇧8`) — pick any screen or window, optionally crop to a region, choose 30/60 fps and
  audio, and record to a native `.mp4`.

Everything stays on your machine — captures go to the clipboard or a folder you choose. Nothing is
uploaded anywhere.

## Features

**Screenshot & annotate**

- Freeze-frame capture of the display under the cursor, at native (Retina) resolution.
- A selection box that's a live window into the frozen screen — **movable** and **corner-resizable**.
- Annotation tools: rectangle, ellipse, arrow, line, and pen.
- Color presets plus a custom-color popover; **Cmd+Scroll** adjusts stroke thickness with a live
  size preview.
- Move / select / delete shapes, resize via handles, and full **undo / redo**.
- Output: **Copy** (or `⌘C`), **Save** (timestamped PNG to your folder), or **Save As…** (dialog).

**Screen recording**

- Source picker for any screen or window; full-screen or **region** crop.
- **30 / 60 fps**, with optional system audio and microphone (mixed when both are on).
- Native **`.mp4`** (H.264/AAC) when the runtime supports it, otherwise `.webm`.
- A **draggable Stop pill** floats over the screen; the rest of the overlay is click-through. The
  pill is excluded from the recording itself, so your captures stay clean.

**App**

- Background **menu-bar / tray app** (no dock icon) with a branded icon.
- **Settings** window to edit both hotkeys and the save folder, persisted across launches.
- Capture overlays are excluded from screen capture (content-protected) so they never bleed into a
  recording.

## Shortcuts

| Action                           | Shortcut               |
| -------------------------------- | ---------------------- |
| Open screenshot capture          | `⌘⇧9` _(configurable)_ |
| Open recording                   | `⌘⇧8` _(configurable)_ |
| Copy annotated image             | `⌘C`                   |
| Undo / Redo                      | `⌘Z` / `⌘⇧Z` (or `⌘Y`) |
| Delete selected shape            | `Delete` / `Backspace` |
| Adjust stroke thickness          | `⌘` + scroll           |
| Dismiss overlay / stop recording | `Esc`                  |

> Hotkeys use `Ctrl` instead of `⌘` on Windows and Linux.

## Install

Grab the latest build for your OS and run it:

| OS      | File                                     | Notes                                             |
| ------- | ---------------------------------------- | ------------------------------------------------- |
| macOS   | `snapit-<version>-mac-<arch>.dmg`        | Open the `.dmg`, drag **snapit** to Applications. |
| Windows | `snapit-<version>-win-<arch>-setup.exe`  | Run the installer (NSIS).                         |
| Linux   | `snapit-<version>-linux-<arch>.AppImage` | `chmod +x` and run.                               |

<details>
<summary><strong>macOS first-launch notes</strong> (unsigned app + Screen Recording permission)</summary>

- **Gatekeeper:** the app is unsigned, so the first launch shows a warning. Right-click the app →
  **Open**, or clear the quarantine flag:
  ```bash
  xattr -dr com.apple.quarantine /Applications/snapit.app
  ```
- **Permission:** grant **Screen Recording** to snapit (System Settings → Privacy & Security →
  Screen Recording) on first capture, or frames come back black.

</details>

## Develop

Requires **Node 22** (pinned via Volta).

```bash
npm install
npm run dev          # launch the app (tray + global hotkeys)
npm run typecheck    # type-check main, preload, and renderer
npm run build        # bundle main / preload / renderer into out/
npm run format       # prettier --write .
npm run icon         # regenerate the app + tray icons
```

Run from a terminal that has been granted **Screen Recording** permission (the permission belongs
to the launching process).

## Build installers

The icons live in `build/`; output lands in `dist/`.

```bash
npm run dist:mac     # → dist/snapit-<version>-mac-<arch>.dmg
npm run dist:win     # → dist/snapit-<version>-win-<arch>-setup.exe  (build on Windows)
npm run dist:linux   # → dist/snapit-<version>-linux-<arch>.AppImage
```

Packaging is handled by [`electron-builder`](https://www.electron.build/) via
[`electron-builder.yml`](electron-builder.yml). Each target is best built on its own OS.

## Tech stack

Electron 42 · TypeScript · electron-vite · React 19 · Konva 10. The renderer is **feature-based**
(`src/renderer/src/features/{screenshot,record,settings}/`), with the Electron main process in
`src/main/`. See [`docs/STATUS.md`](docs/STATUS.md) and [`docs/DESIGN.md`](docs/DESIGN.md) for the
handoff notes and the longer-term roadmap.

## Declaration

snapit is an **independent, personal project**. It is **local-only**: screenshots and recordings
are written to your clipboard or a folder you choose, and the app makes no network calls and sends
no telemetry. It is provided **as-is**, with no warranty, under the MIT License.

## License

[MIT](LICENSE) © 2026 Karan Trehan
