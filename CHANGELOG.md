# Changelog

All notable changes to snapit are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

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

Signed builds are unavailable; macOS shows a Gatekeeper warning on first launch (see the README).
Grab the installer for your platform below.

[1.0.0]: https://github.com/karantrehan3/snapit/releases/tag/v1.0.0
