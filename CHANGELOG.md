# Changelog

All notable changes to snapit are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [3.0.1] - 2026-07-16

### macOS: permissions persist across updates

- macOS builds are now signed with a **stable identity**, so Privacy permissions (Screen Recording /
  Microphone) survive updates instead of being dropped every version. The first update from an older
  ad-hoc build re-prompts **once**, then sticks.
- Documented the manual reset for stuck grants — `tccutil reset All com.karantrehan.snapit` — in the
  README's macOS notes.

> Still not notarized (that needs a paid Apple Developer account), so the first launch after download
> continues to need the `xattr -dr com.apple.quarantine …` / right-click → Open step.

## [3.0.0] - 2026-07-16

### Open & edit existing images (new)

- Open an image that already lives on disk and annotate it with the full screenshot
  toolset (rectangle, ellipse, arrow, line, pen, colours, undo / redo, copy) — the same
  editor, with the whole image as the canvas.
- **Right-click → Open With → snapit** in Finder (and the Windows equivalent): snapit
  registers as an _editor_ for `.png` / `.jpg` / `.jpeg` / `.webp`, so it shows up in the
  menu without ever becoming the default image handler. A tray **"Open image…"** item does
  the same via a file picker.
- **Save a copy** is the default, non-destructive action; **Overwrite original…** (in the
  save dropdown) replaces the file after a confirmation. Export is at the image's native
  resolution and preserves the original format.
- The editor opens as a normal window with a Dock / taskbar entry, unlike the capture overlays.

> **Linux note:** a bare `.AppImage` doesn't register file associations until it's integrated into
> the desktop (e.g. via `appimaged` / AppImageLauncher), so **Open With → snapit** won't appear in
> the file manager there. Use the tray **"Open image…"** item instead — it works on every platform.

### Under the hood

- snapit now takes a single-instance lock, so opening a file routes to the running tray
  app instead of launching a duplicate.
- The annotation engine and toolbar were extracted into a shared `annotate` module reused by
  both the screenshot overlay and the image editor.
- Added a vitest suite for the image open/save helpers.

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

## [2.1.0] - 2026-07-14

### About window

- New **About snapit** window (tray → About snapit): app icon, version, and developer info, with
  links to the website, GitHub repo, and issue tracker (opened in your browser).

### Update checks

- snapit now checks GitHub for a newer release on launch and periodically. When one is available it
  shows an **"Update to vX.Y.Z"** item in the tray (plus a notification) that downloads the installer
  for your platform, and the About window gains a live **Check for updates** with Download / Release
  notes actions. _(Notify-and-download for now; automatic in-place install will follow once macOS
  builds are code-signed.)_

### Under the hood

- macOS release builds sign with a stable identity when one is configured, so Privacy permissions
  (Screen Recording / Microphone) persist across updates instead of re-prompting.
- Added a vitest test suite covering the update-checker logic.

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

[3.0.1]: https://github.com/karantrehan3/snapit/releases/tag/v3.0.1
[3.0.0]: https://github.com/karantrehan3/snapit/releases/tag/v3.0.0
[2.1.0]: https://github.com/karantrehan3/snapit/releases/tag/v2.1.0
[2.0.0]: https://github.com/karantrehan3/snapit/releases/tag/v2.0.0
[1.0.0]: https://github.com/karantrehan3/snapit/releases/tag/v1.0.0
