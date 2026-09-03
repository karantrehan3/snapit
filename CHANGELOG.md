# Changelog

All notable changes to snapit are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [4.0.0] - 2026-09-03

snapit stopped being a screenshot tool with a tray menu. It captures what an application
_did_ — console, network, every click — puts it in a report you can read and send, and
keeps every capture in a library with a front door. The major bump is the shape change:
the app you open is a different object from the one 3.x installed.

### snapit is an application, not a menu that opens windows

Navigation was a menu-bar dropdown into five separate OS windows, so there was no state
you could call "snapit open" and nowhere to land.

- **One window, with sections down the side:** Overview, Captures, Analytics, Claude Code,
  Settings, About. Four of the five old windows became routes.
- **It behaves like an application.** Opens filled to the screen, carries a Dock icon and
  an app-switcher entry, and closing it hides rather than destroys — so it comes back on
  the route you left, with the same scroll and the same capture selected, while snapit
  drops back to the menu bar and keeps its hotkeys.
- The tray is left with the actions: capture, record, stop.

### Captures have somewhere to live

- **A library** of every capture in the save folder — recordings, GIFs, stills and browser
  sessions — with the newest first, grouped by day, findings on every row.
- **Two ways to look.** Rows to work down a column of findings looking for the bug; browse
  mode for tiles, because a 76px sliver of a screenshot identifies nothing.
- **Filters** for Problems, Videos, GIFs, Shots and Web.
- **Rename in place**, which renames the folder on disk. It refuses a name rather than
  sanitising one, and each refusal names the rule it hit.
- Reveal, delete, copy as Markdown, share, and open in a real browser for its devtools.
- **Analytics across every capture** — the one thing devtools cannot do, since it holds the
  session that is open and snapit holds all of them. Local and pure by construction.

### Capture a web app

Chrome, under snapit's control, recorded end to end.

- **Console, network, navigations and every click and form fill**, with the selectors and
  an ARIA snapshot around each action, over the Chrome DevTools Protocol.
- **Two phases.** Setup — signing in, navigating, getting to the broken page — is collected
  and thrown away. Press **Start capture** and the clock restarts, so your sign-in never
  reaches the report. The bar on screen says which phase you are in, because someone who
  believes their password is being recorded behaves differently from someone who knows it
  is not.
- **One bundle.** A recording taken during a session writes its media there and reports
  where it began relative to the session's origin, so a repro step or a console error
  seeks the video to the frame it happened on.
- **Response bodies.** Every failure carries one, whatever its type or size; successful
  `xhr`/`fetch` calls carry one up to 32 KB. Scripts and images do not — measured across
  seven real captures, they were 82 of 89 MB of bodies and nobody opens a bug report to
  read them.
- **A Playwright skeleton** of the session (`generated.spec.ts`), assertions left out.
- The browser's landing page is snapit's own, so the window being collected says so.

### The report reads like a bug report

- Rewritten around the two things a reader wants first: what went wrong, and where in the
  recording it happened. Summary counts jump to sections; every timestamp seeks the video.
- **A network panel** with a sortable table and a waterfall, and a console tab beside it.
- **Markers on the recording.** A rail under the player carries a pin for each marker —
  click to seek, scrub between them, playhead running along it. The same page is what a
  share sends, so whoever you send it to sees the same marks.
- **Rendered on open**, so the in-app view can never drift from what a share would send:
  both come from one renderer.
- Framed in the app inside a sandbox with no shared origin, no preload and
  `default-src 'none'` — a report is arbitrary text from somebody else's application, and
  it is now next to our renderer. Verified against real captures in a production build.
- **Share** offers a single `.html` file, or a `.zip` of the bundle once base64 would push
  the attachment past a mail limit. The size estimate is measured, not reasoned.

### Recording

- **Mark moments while recording**, and rename or delete those markers afterwards from the
  app — a marker can say what happened, not only when.
- **Keep only the last N seconds.** Choose the window before you record; the encoder holds
  a ring and trims to the last keyframe covering it.
- **Annotate while recording**, burnt into the frame.
- **The bar remembers what you chose** — fps, quality, retro window, audio. Nobody wants
  60fps on Tuesday and 30 on Wednesday.
- **Audio for a web capture**, which starts itself and never shows a record bar: the
  microphone and system-audio toggles are on the session bar, and in Settings.

### Redaction, and the text tool

- **A redaction tool** — solid or pixelated. QA environments mirror production, so this is
  table stakes rather than a nicety.
- **The `T` text tool works again**, on the overlay as well as in the editor.

### Claude Code

- **Session tools over MCP**: start and stop a browser session, then read what it collected
  — `get_console_errors`, `get_failed_requests`, `get_steps`, `get_session_summary`,
  `recent_captures`.
- The sidebar says whether an agent is attached, and stops claiming "not attached" while
  one is mid-session: streamable HTTP tears the connection down after each reply, so an
  agent that is working looked absent between requests.

### Fixes worth naming

- **A recording with the microphone on could come back silent.** Opening the mic on a
  Bluetooth headset switches it to the hands-free profile, which runs the audio device at
  16 kHz; the mixer adopted that, which pushed the muxer onto an AAC profile Chromium
  cannot encode, and the failure landed in a promise nobody was watching. Audio is mixed
  at a fixed 48 kHz now, and a capture that loses its sound says so.
- **A saved recording opened the previous capture** and stayed there — a race between
  "show me this one" and the folder scan that would list it.
- **The collector lost every response body** when a session was stopped promptly, which is
  exactly what `stop_browser_session` does.
- **The app's own CSP was being stamped onto the report**, and two policies on one response
  intersect — which blocked the report's own network panel.
- **Video could not seek** in the app: the media path ignored `Range`.
- **Screen Recording permission is explained before it breaks anything**, on first run.
  macOS returns black frames rather than an error, so without the permission every other
  part of snapit looks broken for no stated reason.

### Install

Download the installer for your platform from the assets below.

> **macOS:** the app is signed (ad-hoc) but not notarized, so the first launch is blocked
> with _"snapit can't be opened"_ / _"Apple could not verify… malware"_. Open it once with:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/snapit.app
> ```
>
> …then launch normally. (Or **System Settings → Privacy & Security → Open Anyway**.) This
> is expected for any app not distributed through a paid Apple Developer account.

## [3.2.0] - 2026-08-10

### Claude Code can use snapit directly, over MCP

snapit now runs a local [MCP](https://modelcontextprotocol.io/) server, so Claude Code can request
a screenshot, capture a specific display or region, or hand you the normal capture overlay and wait
for you to select/annotate. Screenshots only — recording produces a file for a human to watch, not
something an LLM can look at, so it isn't exposed.

- **Five tools**: `list_displays`, `capture_screen`, `capture_region`, `pick_region`
  (human-in-the-loop — opens the real overlay and waits for you), and `recent_captures`.
- **Local-only, token-gated.** The server binds to `127.0.0.1` only; every request needs a bearer
  token generated once per install; Host/Origin headers are checked so a malicious webpage can't
  reach it via DNS rebinding. Tray → **Claude Code (MCP)** → **Copy setup command** to connect,
  **Regenerate token…** if it ever leaks.
- **Path by default, image on request.** Capture tools return a saved file's path; pass
  `include_image` to also get a downscaled inline preview instead of a multi-MB base64 blob.

See the [README](README.md#claude-code-mcp) for setup and the full security model.

## [3.1.0] - 2026-07-30

### Recordings are much smaller, and sharper

Recording no longer goes through `MediaRecorder`, which offered no quality control and pinned the
encoder to a low-latency path built for live streaming. Measured against a lossless reference, it
could not exceed SSIM 0.949 **at any bitrate** — it simply stopped improving. snapit now drives
WebCodecs directly at **constant quality**, the same approach OBS uses: bits follow the content, so
a static screen costs almost nothing while a fast scroll gets what it needs.

- **~2× smaller at higher quality.** On an identical capture, 766 kbps → 374 kbps.
- **Correct colours.** Recordings were being tagged BT.601 while their content was BT.709, which
  made everything look flat and slightly off-hue. Fixed.
- **Sensible resolution.** Captures no longer encode the full 2× Retina buffer — four times the
  pixels for detail you cannot see — but never drop below 1080p-class either.
- **Frame rate holds up.** Full-screen capture was falling well short of its target; it now tracks it.

### Quality dropdown

Both recorders now have a **High / Balanced / Small** control in the command bar, with the
trade-off spelled out on each option. It sets the resolution and the encoder's quality target
together, so the presets are meaningfully far apart rather than cosmetic — on 2.4s of real
screen content a GIF ranges from 2022 KB down to 314 KB across them. **Balanced** is the
default and targets the size and clarity OBS achieves on the same footage.

### Silent recording: MP4 by default, GIF still there

The GIF mode is now a **silent recorder with a format toggle**, defaulting to MP4.

- MP4 is roughly **8× smaller than GIF at better quality** — measured on identical frames at the
  same resolution, 110 KB versus 661 KB. GIF has no lossy transform, no motion compensation and
  256 colours per frame, so tuning cannot close that gap.
- **GIF output is still ~6× smaller** than before if you need the format: capped at 1024px on the
  long edge, with a wider unchanged-pixel tolerance. Quality is essentially unchanged.

### Also

- **Annotate while recording.** Draw on screen mid-recording, in both video and silent modes; the
  annotations are burnt into the capture.
- Hardware acceleration is enabled again on macOS 26. It had been disabled to make the capture
  overlay appear instantly, but that also removed the GPU encoder — costing both file size and the
  correct colour tagging above. If the overlay feels slow to appear again, please open an issue.

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
