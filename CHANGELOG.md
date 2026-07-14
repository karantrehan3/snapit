# Changelog

All notable changes to snapit are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-07-14

### GIF recording (new)

- New capture mode on `⌘⇧7`: record the screen (full-screen or region) to an animated `.gif`,
  encoded entirely on-device with `gifenc` — no external tools or ffmpeg binary.
- Frame rate — 15 / 30 / 60 presets or a custom value (5–60 fps, default 30).
- Captured at the area's actual on-screen resolution; per-frame 256-colour palettes for accurate
  screen colours, plus inter-frame differencing (transparency for unchanged pixels) to keep files
  small.
- Editable GIF hotkey in Settings and a tray menu item.
- One-click **"Prefer video?"** nudge — Slack, GitHub and Jira autoplay video, which is sharper and
  smaller than a GIF.

### Redesigned capture UI

- Record and GIF setup replace the large centred modal with a frosted-glass **command bar** docked
  at the top of the screen, which stays visible behind it.
- Source picker in a dropdown popover, frame rate in a compact menu, Full / Region toggle, and
  system / mic icon toggles (recording).
- The selected region's red outline now stays on screen **while recording** so you can see the
  captured area — and it's excluded from the video / GIF (content protection).
- Microphone is on by default for video recording.

### Install

Download the installer for your platform from the assets below.

> **macOS:** the app is signed (ad-hoc) but not notarized, so the first launch is blocked with
> _"snapit can't be opened"_ / _"Apple could not verify… malware"_. Open it once with:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/snapit.app
> ```
>
> …then launch normally. (Or **System Settings → Privacy & Security → Open Anyway**.) This is
> expected for any app not distributed through a paid Apple Developer account — the app is safe.

## [1.0.0] - 2026-06-17

First public release — a local-only screenshot and screen-recording tool for QA, in your menu bar.

### Screenshot & annotate

- Freeze-frame capture of the display under the cursor, at native (Retina) resolution.
- A selection box that's a live window into the frozen screen — movable and corner-resizable.
- Annotation tools: rectangle, ellipse, arrow, line, and pen.
- Color presets plus a custom-color popover; `⌘` + scroll adjusts stroke thickness with a live preview.
- Move / select / delete shapes, resize via handles, and full undo / redo.
- Output: **Copy** (or `⌘C`), **Save** (timestamped PNG), or **Save As…**.

### Screen recording

- Source picker for any screen or window; full-screen or region crop.
- 30 / 60 fps, with optional system audio and microphone (mixed when both are on).
- Native `.mp4` (H.264/AAC) when supported, otherwise `.webm`.
- A draggable Stop pill that's excluded from the recording itself, so captures stay clean.

### App

- Background menu-bar / tray app (no dock icon) with a branded icon.
- Configurable global hotkeys — screenshot (`⌘⇧9`) and record (`⌘⇧8`).
- Settings window to edit hotkeys and the save folder, persisted across launches.
- Capture overlays are content-protected, so they never bleed into a recording.

### Install

Download the installer for your platform from the assets below.

> **macOS:** the app is signed (ad-hoc) but not notarized, so the first launch is blocked with
> _"snapit can't be opened"_ / _"Apple could not verify… malware"_. Open it once with:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/snapit.app
> ```
>
> …then launch normally. (Or **System Settings → Privacy & Security → Open Anyway**.) This is
> expected for any app not distributed through a paid Apple Developer account — the app is safe.

[2.0.0]: https://github.com/karantrehan3/snapit/releases/tag/v2.0.0
[1.0.0]: https://github.com/karantrehan3/snapit/releases/tag/v1.0.0
