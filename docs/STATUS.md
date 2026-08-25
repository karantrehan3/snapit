# snapit — Status & Handoff

> Living handoff doc. Read this plus [`ROADMAP.md`](ROADMAP.md) to pick up work in any session.
> [`DESIGN.md`](DESIGN.md) is kept for its stack rationale and locked decisions; its phase 3–4
> roadmap is superseded by `ROADMAP.md`.
>
> Last updated: 2026-08-25.

## What this is

A local-only macOS capture tool for QA — Lightshot-style screenshots with annotation, screen
recording, and a local MCP server so Claude Code can see the screen. `ROADMAP.md` sets out where it
goes next: a capture becomes a bug report with context (Phase 1), and that context becomes Playwright
specs (Phase 2).

- **Repo:** `github.com/karantrehan3/snapit`, default branch `master`.
- **Stack:** Electron 42 + TypeScript + electron-vite + React 19 + Konva 10, Volta-pinned node 22.
- **Platform:** developed and tested on macOS. Windows/Linux builds come from CI and are unverified
  on real hardware.

## Commands

```bash
npm run dev          # tray app + global hotkeys
npm run typecheck    # main + preload + renderer
npm test             # vitest (pure logic only; no DOM environment)
npm run build        # bundle into out/
npm run format       # prettier --write .
```

Run `dev` from a terminal that has been granted **Screen Recording** — the permission belongs to the
launching process. Black frames mean it doesn't.

## What's built

**Capture and annotate** (`features/screenshot`, `features/annotate`, `features/edit`)
Freeze-frame at native resolution, movable/resizable selection box, rect / ellipse / arrow / line /
pen / **text** / **redact**, colour presets plus a custom popover, ⌘+scroll for stroke thickness —
or font size when the target is text, or block size for a redaction. Undo/redo, copy, save, save-as.
The same engine drives the image editor, where the whole image is the canvas.

Redaction has two modes and defaults to **solid**: pixelated and blurred text are both recoverable in
some cases, so the safe one is not the opt-in. Pixelate re-samples the frozen frame through Konva's
Pixelate filter, cached at the export pixelRatio.

**Recording** (`features/record`, `features/gif`)
Source picker (screen or window), region crop, 30/60fps, system + mic audio, High/Balanced/Small
quality. WebCodecs at constant quality via `mp4Encoder`, muxed by mediabunny. Silent recording adds
an MP4/GIF toggle. Live annotation burns into the capture.

`createRetroEncoder` is the second encoder: it defers muxing so the front of a recording can be
dropped ("keep only the last 30s/60s/3m", video recording only). `createMp4Encoder` is untouched and
still handles every untrimmed recording — do not disturb it, its behaviour is measured in
`quality.ts`.

**Bundles** (`main/bundle.ts`, `main/report.ts`)
A recording saves as a folder holding the media, `meta.json` and a self-contained `report.html`. The
media keeps the name it would have had as a loose file. Settings has a checkbox to go back to flat
files. `report.html` must never fetch anything from the network — a test enforces it.

The report is two columns: the player sticks beside the timeline, and playback moves a highlight
down each list, so a timestamp is worth clicking because the frame it seeks is still on screen. The
counts lead and double as the jump list; the environment table is folded away. Repeated console
lines collapse with a count, and chatter hides behind a CSS-only filter that starts on — CSS-only so
a session with no video still ships no script at all.

**Look** (`styles/tokens.css`, `components/Icon.tsx`)
One palette, in custom properties, for two contexts: chrome floating over someone else's screen, and
windows of our own. Meaning colours (blue selected, red recording) are shared. Annotation colours are
**not** tokens — Konva draws them onto a canvas, which cannot resolve a variable, so they stay
literal in `annotate/types.ts`. Icons are one inline-SVG set on a 24-unit grid, stroked in
`currentColor`; no emoji, no Unicode glyphs. Focus rings are an `outline`, because inline styles beat
a stylesheet and most controls set their own `box-shadow`.

**Capture preferences** (`main/capturePrefs.ts`)
The bar opens where it was left: fps, quality, retro window, audio, MP4/GIF. The prefs travel with
the capture session rather than being fetched by the overlay, so it renders once instead of painting
defaults and correcting itself. Saved when a capture starts, not on every toggle. The silent bar
keeps its own frame rate — 30 against the recorder's 60, because a 60fps GIF is enormous.

**Markers** (`features/record/markers.ts`)
⌘⇧M or the pill's flag drops a timestamped marker; they land in `meta.json` and become a seekable
list in the report. The hotkey is registered only while recording.

**MCP server** (`main/mcp/`)
`list_displays`, `capture_screen`, `capture_region`, `pick_region`, `recent_captures`. Local-only,
bearer-token gated, Host/Origin checked. `recent_captures` understands bundle folders, including the
partially-written ones the save path deliberately allows.

## Conventions that matter

- **Pure logic lives in its own electron-free module and is unit-tested**; the fs/electron wrapper
  around it is not. See `filename.ts`, `bundle.ts`, `mcp/region.ts`, `record/retroBuffer.ts`,
  `capturePrefs.ts`.
- Tests live in `tests/` beside the code, `src/**/tests/*.spec.ts`, environment `node` — there is no
  DOM, so component behaviour is not unit-tested.
- Renderer is feature-based: `features/<name>/{Component.tsx, useThing.ts, types.ts, styles.ts}`.
- Colours, radii, shadows and the font stack come from `styles/tokens.css`; a new literal in a
  `styles.ts` is a token that has not been added yet. New iconography goes in `components/Icon.tsx`.
- Prettier: no semicolons, single quotes, width 110. Run `npm run format`.
- Comments earn their place or come out.

## Open decisions

- **Background arming of the retro buffer.** The encoder supports it; whether snapit becomes an
  always-capturing app is unresolved. See `ROADMAP.md` M1.2.
- **Notarization**, deferred 2026-08-21. `build/afterPack.cjs` codesigns manually with `--deep` while
  `electron-builder.yml` sets `identity: null`; notarization needs electron-builder to sign
  inside-out with hardened runtime and entitlements. That conflict is the trap.

## Known macOS issues

- Builds are ad-hoc signed and not notarized, so first launch needs
  `xattr -dr com.apple.quarantine /Applications/snapit.app`, and Privacy grants reset on each update.
  `tccutil reset All com.karantrehan.snapit` clears a stuck state.
- Screen Recording permission belongs to the launching process in dev.
