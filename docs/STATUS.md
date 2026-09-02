# snapit — Status & Handoff

> Living handoff doc. Read this plus [`ROADMAP.md`](ROADMAP.md) to pick up work in any session.
> [`DESIGN.md`](DESIGN.md) is kept for its stack rationale and locked decisions; its phase 3–4
> roadmap is superseded by `ROADMAP.md`.
>
> Last updated: 2026-09-03.

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
lines collapse with a count, and chatter hides behind a CSS-only filter that starts on.

**On scripts.** The rule used to be that a report with no video shipped none at all, and the console
filter is a CSS checkbox because of it. That rule is now narrower: **a report ships a script when
there is something to drive** — a player to seek, or the Network panel below. A screenshot or a plain
recording still carries no JavaScript, every line of what does ship is ours, and the page still
fetches nothing. A test enforces the last of those.

**Look** (`styles/tokens.css`, `components/`)
One palette, in custom properties, for two contexts: chrome floating over someone else's screen, and
windows of our own. Annotation colours are **not** tokens — Konva draws them onto a canvas, which
cannot resolve a variable, so they stay literal in `annotate/types.ts`. Icons are one inline-SVG set
on a 24-unit grid, stroked in `currentColor`; no emoji, no Unicode glyphs. Focus rings are an
`outline`, because inline styles beat a stylesheet and most controls set their own `box-shadow`.

**The palette is the logo's.** `#e84838` is not a design choice — it is measured out of
`build/icon.png`, where it is 221,460 of the icon's pixels. snapit's identity is black,
white and that red, and the interactive colour used to be a blue borrowed from the
report, which belonged to neither.

The rule that took a second pass to learn: **red fills act, red ink warns, and nothing
else is red.** A filled red is an action, which for a capture tool is the right reading —
red has meant "record" on every device anyone has owned. Red as ink or an edge is
severity. Pointing links, selection washes and folder sizes at the brand as well made the
whole window red, and a page where everything is emphasised has no emphasis: the CTA
stopped being findable and the severity stripes stopped being alarming. So links are ink
with an underline and selection is a lift in surface (`--selected`).

**A type scale, finally.** There were fourteen sizes across our own windows — 9.5 through
26, including 11, 11.5 and 12 — which is not a scale, it is every number somebody reached
for. Six tokens now (`--t-micro` … `--t-display`), verified by measuring _computed_ sizes
in the running app rather than reading the source, because a broken `font` shorthand falls
back to the UA default silently.

**The window family follows the system, and its values are the report's.** It used to be light and
only light, which was survivable while a report was something you opened in a browser.
`reportStyles.ts` declares `color-scheme: light dark` on purpose — a report has to look right on
whatever machine it is opened on — so on a Mac set to dark, snapit was a bright white slab wrapped
around a correctly-dark artifact with a one-pixel border between them. The window tokens are now the
report's own hexes in both schemes, so the two are one surface. Anything else would need justifying
as a deliberate difference between a window and the thing inside it, and there isn't one.

The **glass family does not follow the system**: it floats over other people's screens, where the
only thing that matters is not competing with what is underneath. `--accent` stays with it, measured
against dark glass in the overlays; `--focus` is the window family's interactive blue and equals the
report's, because a button in the home window sits a few pixels from the report's active tab. Two
blues, because there are two contexts — the same reason there are two surface families.

`main/windows.ts` duplicates the two `--surface` values as `GROUND`, because the main process cannot
read a stylesheet and a window's `backgroundColor` is what paints before the renderer does. They are
the only two values duplicated.

**Components** (`components/`)
`Button`, `Chip`, `Panel`, `Field`, `KeyCap`, `Icon`. There were nine buttons before this: an
accent-filled one in Welcome, a different one in Settings, a third in About at a third height, two
outlined ones differing only in padding, a square icon button in the library and a red one in the
session bar. None disagreed on purpose — a button is four lines of CSS, and writing those four lines
is always easier than finding where the last one lives. Three keycaps and three "primary" fills, all
within one window of each other during first run.

`variant` says what a control is for and `tone` says which family it is in; those are also the `data-`
attributes the hover, focus and press states in `tokens.css` are keyed on, since that is the one part
of a button an inline style object cannot express. **Monospace is for values that align in a column** —
durations, counts, sizes, clock times — and not for labels.

**`#gallery`** renders every component in every state, in whichever scheme the system is set to, and
is in the tray in development only. It earned itself immediately: the `link` variant ignored
`disabled` entirely, because the disabled treatment only existed in the non-link branch.

**Capture preferences** (`main/capturePrefs.ts`)
The bar opens where it was left: fps, quality, retro window, audio, MP4/GIF. The prefs travel with
the capture session rather than being fetched by the overlay, so it renders once instead of painting
defaults and correcting itself. Saved when a capture starts, not on every toggle. The silent bar
keeps its own frame rate — 30 against the recorder's 60, because a 60fps GIF is enormous.

**The app shell** (`features/shell`, `features/captures`)
snapit is one window. It used to navigate through a menu bar dropdown into five separate
OS windows — captures, settings, about, first run, the editor — so there was no state you
could call "snapit open" and nowhere to land. The dropdown was the navigation.

Now: a sidebar of routes, a top bar carrying the one action with a right moment, and a
landing surface. **Overview · Captures · Analytics · Checks (soon) · Claude Code ·
Settings · About.** Four of the five windows became routes. Two are still windows and
have to be: first run (shown before there is an app to be inside) and the image editor (a
document with its own undo stack). The capture overlay is a third, and is not in the
`windows.ts` registry either — it is created once and reused, shown and hidden rather
than opened and closed, and revealed only when the renderer reports it painted.

**The tray is actions only.** Screenshot, Record, Record GIF, Capture a web app, Open
snapit, Quit — plus one conditional row when an update exists, which is the only thing
there that is not an action and the only way a never-opened background app learns about
one. Closing the window leaves snapit resident, which it already did.

**One window, and it behaves like an application.** It opens zoomed, carries a Dock icon
and an app-switcher entry while it is open, and **closing it hides rather than destroys**
— so it comes back on the route you left, with the same scroll and the same selected
capture, and snapit drops back to the menu bar. `watchForQuit` exists because that is one
line from making Quit impossible: `app.quit()` closes every window, a `hideOnClose`
handler cancels each one, and the app carries on running with nothing on screen.

**A finished capture opens in the app, not in Finder.** Every save used to end at
`shell.showItemInFolder`, which answers "where is the file" — a question nobody has just
after making a capture. `showCaptureInApp` opens the window on it instead. Two
exceptions, both deliberate: a screenshot copied to the clipboard is already on its way
somewhere and interrupting it with a window is the opposite of helping, and Save-as put
the file outside the save folder so the library has no entry to open.

**Renaming** (`main/captureName.ts`) is editable in place in the detail header — a name is
one field and a modal for one field is a modal too many. The rules are pure and tested,
and they refuse rather than sanitise: `../evidence` would rename something the user did
not mean and report success. A loose capture keeps its extension whatever is typed,
because the library reads the kind off it and a `.png` renamed to `.txt` stops being a
screenshot. Collisions are caught case-insensitively — macOS treats `Login bug` and
`login BUG` as one file, and a rename that "worked" and lost a capture is the worst
outcome available.

**The image editor is a route, not a window.** Editing a screenshot used to take you out
of the list you found it in. `edit` is `unlisted` in the route registry: reachable but not
in the sidebar, because it is somewhere you are sent rather than somewhere you browse.

**Capturing is reachable from inside the app, on every route.** This was got wrong first
time: the shell shipped with one capture button in it — "Capture a web app" — and the
other three modes were reachable only by global hotkey or the tray, which makes the
landing surface of a capture tool a poster. And "Open image…" was taken out of the tray
without being given a home anywhere, so for one commit the feature existed in `preload`
and `index.ts` and could not be reached at all. Both are fixed and the audit that would
have caught them is in the conventions below.

The top bar carries the set compactly on every route; the Overview carries the same list
with each chord spelled out, read from settings rather than hard-coded so an edited hotkey
teaches the right thing. One list — `features/shell/captureActions.ts` — because two
renderers disagreeing about what snapit can do is exactly the drift worth preventing.

Starting a capture from the window **hides the window first**, and shows it again when the
capture is dismissed or saved. A screenshot taken from a button inside snapit would
otherwise have snapit in it, and the region selector needs to see what is behind us.

**A route is declared in one place.** `routes.ts` holds the label, the icon, the view and
whether it manages its own scrolling; the shell renders whatever the registry names and
the sidebar generates itself from it. Adding Checks means adding a line to that file. The
shell itself holds the route and lays out the frame, and nothing else — the sidebar is
`Sidebar.tsx`, the polling is `useShellStatus.ts`.

**Why the sidebar is worth its 202px.** It is where state lives: Screen Recording (the
permission that makes every other part of snapit look broken, because macOS returns black
frames rather than an error), whether a session is collecting, and whether an agent is
attached over MCP. All three are polled, because none of them is an event this process
sees — a permission is granted in another application and an agent attaching is a socket
opening.

**Overview answers "is this working", not "how many files are there".** No big-number
tiles: the counts are not the point of that page and a row of large figures would
emphasise a question nobody has. Analytics is the one page whose subject really is the
figures, and it is the one place they get the scale.

**The Captures route** keeps everything the list was good at — every capture newest first,
grouped by day, findings on the face of each row, arrow-key navigation, thumbnails fetched
per row so the window paints before the OS thumbnail service answers — and adds the one
idea borrowed from the inspector-shaped alternative: **the list collapses.** Measured,
with the sidebar in place: 696 CSS px of detail with the list open, 1077 with it
collapsed. The report's own two-column breakpoint is 992, so collapsing is what lets the
player stick beside the timeline instead of stacking above it. Collapsed, the detail's
header carries a switcher and prev/next so you can still move between captures.

**How a capture is shown, and why it is a frame.** `report.html` is produced in the main
process by `renderReport(meta, data, opts)` — one pure function returning one
self-contained page, already carrying the player, the timeline, the markers, the console
and the Network panel. Three ways to show that in a React renderer, and they are not
equal:

|                                                          | Cost                                                  |
| -------------------------------------------------------- | ----------------------------------------------------- |
| **(a) Frame the rendered report**                        | The app cannot put its own controls around the player |
| (b) React components over the same bundle JSON           | Two renderers for one thing                           |
| (c) Play the media natively, frame the timeline below it | Both, plus a bridge between them                      |

**Decided: (a).** (b) is the duplication this codebase spent a session removing — the
sortable table with its four detail tabs, the console with its repeat collapsing, the
seek script and the sticky player, all kept in step by hand and diverging the first time
either half is improved. (c) reads like the compromise and is the most expensive: the
report's whole layout exists so that _a timestamp seeks a player still on screen_, and
splitting the player from the timeline across a frame boundary means a `postMessage`
bridge, a suppressed media column, and conditional behaviour inside the one pure function
whose virtue is having none. Three new seams to buy app-styled playback controls, which
are a nicety.

What (a) gives up is real and it is only that: the player's controls are the browser's,
inside the frame. What it buys is that the in-app view **cannot** drift from the shared
file, because both come from the same `renderReport` call, and nothing had to be added to
the renderer to get there.

A capture with no report — a loose `⌘⇧9` screenshot, which is most of the save folder —
has no page to frame, so the detail shows the file itself. `captureView` in the main
process decides which of the two it is, because deciding needs the filesystem.

**The frame's boundary** (`main/captureUrl.ts`)
A report is arbitrary text from someone else's application: console output, request URLs,
response headers, error bodies. It is escaped, and until now it only ever opened in an
external browser, in a tab with nothing of ours in it. Framing it puts it next to
`window.snapit`, so it does not run in our renderer at all — it gets its own document on
its own scheme.

**Why a scheme and not `srcdoc`**, which would have been less machinery: a `srcdoc`
document inherits the embedder's CSP, and the renderer's is `script-src 'self'` with no
`'unsafe-inline'`. The report's Network panel _is_ an inline script, so it would silently
not run — and loosening the app's own policy so a page of foreign text can execute is the
wrong direction. A document loaded over a scheme carries whatever policy its response
says. A standard scheme also means `capture.mp4` resolves against `…/report.html`, so
`renderReport` is called with no options at all and the page is what a bundle carries.

`sandbox="allow-scripts"`, and nothing else:

- **`allow-scripts` granted** — the panel's sorting, filtering and detail tabs are a
  script, as is seeking from a timestamp. Without it the table still renders (every row's
  sort keys and filter text are in the markup) but stops being usable.
- **`allow-same-origin` withheld**, the important one. With both tokens a frame is
  same-origin with its embedder, can reach into it, and can remove its own sandbox
  attribute and reload out of the sandbox. Without it the origin is opaque.
- **`allow-forms`, `allow-modals`, `allow-popups`, `allow-top-navigation`,
  `allow-downloads` withheld** — the report has no forms and navigates nowhere. Its only
  links are same-document fragments (`#requests`, `#console`, the `:target` tabs), which
  need no token.

Three things hold it up from outside. The frame gets no preload
(`nodeIntegrationInSubFrames` is off). The report is served under `default-src 'none'`
with **no `connect-src` at all**, so a script that did get in has nowhere to send what it
found. And a grant is one capture: an opaque id maps to one folder — or to one _file_, for
a loose screenshot, since granting its folder would grant the whole save directory — and
the path went through `assertInside` when the grant was made. `captureFileName` refuses
traversal rather than sanitising it, and refuses the sibling JSON outright, so a session's
HAR is not one fetch away from the page.

Measured against real captures, in a production build with the CSP applied: inside the
frame `window.snapit` and `require` are `undefined`, `window.origin` is `null`, the parent
DOM and `localStorage` both throw `SecurityError`, removing the sandbox attribute throws,
and `fetch('meta.json')` is refused by `default-src 'none'`. Meanwhile sorting, the type
filter, the request detail pane and seeking from a timestamp all work.

**Two things that had to be fixed to get there, both silent:**

- **The app's CSP was being stamped onto the report as well.**
  `webRequest.onHeadersReceived` applied it to every response in the default session,
  including the capture scheme's. Two policies on one response are _intersected_, and the
  app's has no `'unsafe-inline'` for script — so the report's Network panel and its seek
  script were both blocked, with the table rendering perfectly and doing nothing. The
  handler now leaves the capture scheme alone, because its own policy is far stricter.
- **The media protocol ignored `Range`.** A player seeks by asking for a byte range;
  answering with the whole file from zero produces a video that plays and cannot be moved.
  Measured before the fix: setting `currentTime` to 56s in a 57s recording left it at 0.
  `serveMedia` now parses the range, answers 206 with `Content-Range`, and streams from a
  read stream rather than buffering — a recording is hundreds of megabytes and this is the
  process that owns every window.

**Is Claude Code connected?** (`main/mcpStatus.ts`)
The sidebar said "not attached" while an agent was actively using snapit, because it was
counting open transports. Streamable HTTP tears the session down after each reply, so
between calls there is nothing open and a perfectly configured Claude Code read as absent
for all but the milliseconds of a request. `mcpActivity` now reports live sessions **and**
when a request was last served, and `mcpState` turns that into `live` / `idle` / `stale` /
`never` with a 15-minute idle window. Pure and tested, because the boundaries are a
judgement.

**Analytics** (`main/analytics.ts`, `main/analyticsSource.ts`, `features/shell/Analytics.tsx`)
The one question snapit can answer and DevTools cannot. DevTools has the session that is
open; snapit has every session anyone has run. So the headline is not how many captures
exist — it is **which endpoint failed in more than one of them**, because one 500 is an
event and the same 500 across four sessions over three weeks is a bug nobody has filed.

Run against the save folder it read 55 captures in 29 ms and found
`POST /api/v5/login/admin` failing in four separate captures with 404s and 401s, plus two
missing config files 404ing in four each. None of that was visible in any single report.

**The normalisation is the whole trick.** `/api/v5/company/37002/services` and
`/api/v5/company/41883/services` are one endpoint failing twice, not two failing once —
without collapsing ids, uuids, hashes, dates and the query string, every row is unique,
every count is 1 and the page says nothing. It is deliberately conservative:
over-collapsing merges two real endpoints and reports a failure count for something that
does not exist, which is worse than two rows for one endpoint, since that at least is
still true. `MEDIC-2233` and `develop` survive; `{id}` and `{token}` do not.

Percentiles are nearest-rank, not interpolated: a QA session makes a handful of calls to
any one endpoint, and a duration nobody measured is not worth reporting. Three samples
minimum before an endpoint may be called slow, so one nine-second anecdote cannot top the
table.

**Local, and structurally so.** `analytics.ts` is pure — it takes facts and returns
numbers, and cannot reach the network because it imports nothing that can. The decision
was "build the local insight now, leave a clean seam for opt-in telemetry later, wire
nothing up": that seam is that a sender would be a separate module consuming this one's
output, with its own setting and its own visible log of what it sends. Nothing was built
toward it. `analyticsSource.ts` bounds the reading — HARs are ~0.5 MB each, so only
bundles inside a 90-day window are opened, at most 120 of them, and the result is cached
until the folder changes.

**Sharing** (`main/standalone.ts`, `main/standaloneFile.ts`, `main/share.ts`)
Library → **Share** writes one `.html` a recipient can open with no snapit, no folder, no network
and no trust: the recording inlined as a data URI, and `network.har`, `console.json`,
`actions.json`, `generated.spec.ts` and `meta.json` as download links off data URIs. Nothing is
uploaded and no link is minted — see `ROADMAP.md` M1.6 for why that is not a reversal of the
no-cloud decision, and M1.7 for what a link would cost.

The media is streamed through `createBase64Encoder` into the output file rather than read and
encoded whole. That is the whole reason this is not three lines: base64 costs four characters per
three bytes, and doing it in one go costs the recording twice over in a process that also owns
every window. Measured, writing the same 167 MB capture:

| Approach                          | Peak RSS | Write time |
| --------------------------------- | -------- | ---------- |
| `readFile` → `toString('base64')` | 1.15 GB  | 1598 ms    |
| Streamed in 3 MB chunks           | 215 MB   | 280 ms     |

The streamed peak does not move with the recording — a 560 MB one also cost 213 MB — and both
approaches produce byte-identical files.

Sizes are exact before anything is written, because base64's length is arithmetic:

| Capture                           | Media  | Export | Opens in Chrome 151         |
| --------------------------------- | ------ | ------ | --------------------------- |
| Session, no video                 | —      | 1.0 MB | instant                     |
| 1:41 session + recording          | 2.4 MB | 4.1 MB | instant                     |
| 33 min recording                  | 102 MB | 136 MB | video ready in 392 ms       |
| 43 min recording                  | 167 MB | 223 MB | parses in 2.2 s             |
| 12 min, pre-3.1.0 `MediaRecorder` | 381 MB | 508 MB | parses in 5.4 s, plays      |
| 30 min, pre-3.1.0 `MediaRecorder` | 560 MB | 746 MB | **renderer never responds** |

The last two are the old `MediaRecorder` era at 19–33 MB a minute; today's encoder writes 3–4, which
is what the two 30-minute-plus rows above cost. Both are useful here: the small numbers are what
people will actually export, and the large ones are the only way to find where it breaks.

Hence two thresholds. **25 MB** — five or six minutes of full-screen recording at 3–4 MB a minute —
is where the export says the number and offers the report without the video, because that is the
smallest attachment limit anyone hits. **512 MB** is where it stops offering to inline at all: past
it the page does not open, which is not a trade worth presenting. Everything between is the
sender's call, since only they know where it is going.

**Sharing, the package** (`main/packageFile.ts`)
The single file is right while it fits and stops fitting early. Base64 costs a third of
the recording and the recording is nearly all of the file: a 33-minute capture is 153 MB
on disk and 204 MB as one page, which no mail, chat or issue tracker accepts. So there
are two shapes, and under the attachment limit nothing is asked — the single file wins on
every axis because it needs nothing of the recipient.

| Shape            | When        | Why                                  |
| ---------------- | ----------- | ------------------------------------ |
| One file `.html` | under 25 MB | Double-click, nothing to unpack      |
| Package `.zip`   | above it    | Every file real, at its own size     |
| Report only      | on request  | The destination takes almost nothing |

The package needed no change to the report, which is why it is short: `report.html`
already addresses its media by bare filename, because that is how a bundle folder works
— so a zipped folder unzips to a working report with a working player. `yazl` streams it
off disk rather than buffering, for the same reason the single file streams its base64.
A `README.txt` goes in, because a folder of seven files does not say where to start.

**The size estimate is measured, not reasoned.** The first version assumed media was
incompressible and text compressed to a third, and was 53% out on the first bundle it
met. Across five real captures:

| Entry                           | Deflate saved |
| ------------------------------- | ------------- |
| `report.html`                   | 70–92%        |
| `network.har`                   | 93–95%        |
| `console.json` / `actions.json` | 79–92%        |
| The recording (`.mp4`)          | 8–37%         |

Text goes to about a tenth — an inlined report and a HAR are both mostly repeated markup
and repeated URLs. And H.264 is _not_ incompressible: a static-UI recording gave up a
third, while the 160 MB one, long and busy, gave up 8%. The estimate therefore takes the
worst case observed for media, so it overstates for short captures and lands within 0.4%
on the long one — right way round twice, since the number is only shown once the single
file has already lost, and being pleasantly small is the harmless direction to be wrong
in.

Verified end to end: a real bundle written, unzipped, and the report inside checked for
its media reference and a fresh render. **A shared folder now carries the current report**
— `preparePackage` re-renders rather than copying the stale `report.html`, closing the
last place that asymmetry showed.

**Network and Console, tabbed** (`main/reportNetwork.ts`, `main/reportNetworkScript.ts`, `main/reportRequests.ts`)
They share one full-width panel below the two columns, a tab each, because both want more room than
half a page and only one is read at a time. The tabs are `:target`, not a checkbox or a script — the
counts in the summary bar are already links to `#requests` and `#console`, so driving the tabs from
`:target` means those links switch tabs on the way to scrolling, with nothing to keep in step. The
cost: the console no longer sits beside the player, so a console timestamp scrolls the video back
into view rather than seeking one already on screen.

The report used to show failed requests as a list. The Network tab now works the way DevTools does: a sortable table of **every** request
— At, Name, Status, Type, Initiator, Size, Time, Waterfall — with a text filter, Chrome's own type
chips, a failures-only toggle, and a detail pane on **Headers / Payload / Response / Timing**.

Why a panel and not a list: showing failures answered "what broke" and nothing else. Sorting by
duration to find the slow one, narrowing to Fetch/XHR to skip the fonts, checking whether a preflight
went out before the request that needed it — these are what a person actually does with a captured
session, and none of them are a list.

Three things about it that are not obvious:

- **The script drives markup that is already there.** Every row carries its own sort keys and a
  lowercased filter haystack in `data-` attributes, and every detail pane is rendered shut in the
  page. Nothing is serialised to JSON and rebuilt, so escaping happens once, on the server side, and
  a reader with JavaScript off still gets the whole table.
- **The waterfall is honest about being small.** Bars are positioned on the session clock and rescale
  to whatever is filtered in, so narrowing to Fetch/XHR acts as a zoom. But a page load is seconds
  and a QA session is a minute, so a one-second request really is a few pixels — Chrome has the same
  arithmetic and answers it with drag-to-zoom, which this does not have. The Time column and the
  Timing tab carry magnitude; the bar carries position. A tooltip on each bar names both.
- **Where the HAR is empty, the pane says which of three reasons applies** — it failed and Chrome
  had evicted the body, it was over the size cap, or it was a static asset. See below.

**Which responses keep a body** (`wantsBody` / `bodyFitsBudget` in `collector/har.ts`)
CDP events never carry bodies; each one is a separate `Network.getResponseBody` round trip, so they
are rationed. The rule is **resource type first, size second** — the same line
[Jam draws](https://jam.dev/docs/product-features/dev-tools/network-req-resp-bodies), which keeps
bodies for XHR/fetch and excludes static assets. Measured across seven real captures:

| Policy                           | Bodies | Total  |
| -------------------------------- | ------ | ------ |
| Failures only (until 2026-08-31) | 17     | 4 KB   |
| **Failures + XHR/fetch < 32 KB** | 212    | 237 KB |
| Failures + XHR/fetch, no cap     | 222    | 3.2 MB |
| Everything                       | 486    | 89 MB  |

78 MB of that 89 MB is JavaScript and 4 MB is images, which is why the type filter does the work and
the size cap is only a backstop — it drops ten bodies, an i18n bundle fetched three times and a
search-results page. Failures are exempt from the cap: they are rare and one of them is the point.
`MAX_BODY_CHARS` still truncates whatever comes back at 20,000 characters.

**This widened what a bundle can contain, so redaction widened with it.** `redactHar` used to run
`redactJsonText` only over bodies declaring a JSON mime type, which was safe while only failures had
bodies; an API response served as `text/plain` would now have gone through untouched. It runs over
every text body — the function returns anything it cannot parse unchanged, so the widening is free.
Worth keeping in mind regardless: a QA environment mirrors production, and an API response is
customer data in a way a 500's error envelope was not.

**Verified live 2026-09-03**, which the predicates alone never were. `startCollector` is
electron-free, so a fixture app was served over loopback making exactly the requests the policy has
to discriminate between, and driven in real Chrome over CDP. Static assets carry no body whatever
their size (a 60 KB script, a stylesheet, an image, the document itself); XHR and fetch under the cap
carry theirs; a 200 KB successful fetch does not; a 500 with a 100 KB body does, truncated at
`MAX_BODY_CHARS`; a 404 image is a failure first and keeps its four bytes. Every text body came back
redacted, including one served as `text/plain`, and no secret survived anywhere in the HAR.

**It found a real hole, and it was not in the predicates.** `stop()` tore the CDP session down
without waiting for the `Network.getResponseBody` calls it had fired, and without waiting for the
`loadingFinished` events that decide whether to fire one at all. Stopping immediately after the last
request lost **every one of thirteen** bodies. It went unnoticed because a person reaches for the
tray, which takes seconds — but `stop_browser_session` over MCP has no such pause, and an agent
driving the browser then stopping is exactly the zero-delay case. `stop()` now flushes each page's
CDP session with a round trip (a session is one ordered stream, so a reply cannot overtake an event
queued before it) and then drains the in-flight body fetches, both capped at `BODY_DRAIN_MS`. With
the fix the zero-delay run keeps all thirteen.

`ssl` is never added to `connect` — HAR defines it as already counted inside it, and adding both
inflates every HTTPS row. The Timing tab says so on the page.

It is still not DevTools and cannot be: there is no live page to re-issue a request against, no
filmstrip, no throttling. The footer names `network.har`, which is spec-valid HAR 1.2 and opens in
DevTools → Network for everything this does not do. An SVG viewer was considered and refused:
[PerfCascade](https://github.com/micmro/PerfCascade) is MIT and self-contained, but it is only a
waterfall, and it would put third-party code inside the artifact snapit tells people is safe to open
on an untrusted machine.

`mcp/summarise.ts` is untouched: an agent pays for every line, so its failures-only view is still
the right one there.

**Audio on a web capture.** Every web capture was silent until 2026-09-03, and not by
design: the auto-start path in `RecordOverlay.tsx` hard-coded `systemAudio: false, mic:
false` while the manual path honoured the saved prefs, which default both to on. It now
passes the prefs through, so narrating the bug while you reproduce it works — which is
most of why anyone records one. A microphone that will not open is reported through
`notifyProblem` rather than only logged: somebody talking into a mic that was never
opened finds out on playback, by which point the bug has been and gone.

**Web capture, on screen** (`features/session/SessionBar.tsx`)
Starting the capture is a bar, not a tray item — it is the one action with a right moment. The bar
names the phase (setup is collected and discarded; capturing is what reaches the report), shows
without taking focus from the browser, and is click-through except over itself. It also carries the
window-not-found case, where there is no recording pill to stop from. The tray keeps the way in and
a way out, nothing between.

**First run** (`features/welcome`)
Shown once, and mostly about Screen Recording: without it macOS returns black frames rather than an
error, so it is the one failure that makes everything else look broken. Re-checks on focus, since
granting happens in another application. `hasSeenWelcome` is not settable through `settings:set`.

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
  `capturePrefs.ts`, `libraryEntry.ts`.
- **Shared vocabulary has one home, and readers import it rather than restating it.** HAR shape,
  `isFailedStatus` and `looseEntries` live in `collector/har.ts`; console level names in
  `collector/levels.ts`; `str` / `num` / `clip` for values that came from outside in `untrusted.ts`.
  Four modules used to carry a hand-rolled `HarEntry` apiece and three spelled out
  `status === 0 || status >= 400` separately, which is how the report, the agent and the
  body-fetcher end up disagreeing about which requests mattered. HAR 1.2 itself is
  `@types/har-format` — types only, no runtime.
- **A constant two modules must agree on is passed, not commented.** `keepMostTelling` takes its
  limit from the renderer that owns `MAX_ROWS`, rather than keeping a copy in step by comment.
- Tests live in `tests/` beside the code, `src/**/tests/*.spec.ts`, environment `node` — there is no
  DOM, so component behaviour is not unit-tested.
- Renderer is feature-based: `features/<name>/{Component.tsx, useThing.ts, types.ts, styles.ts}`.
- Colours, radii, shadows and the font stack come from `styles/tokens.css`; a new literal in a
  `styles.ts` is a token that has not been added yet. New iconography goes in `components/Icon.tsx`.
- **A control that exists on two surfaces belongs in `components/`, not in both `styles.ts` files.**
  Check `#gallery` before adding a variant — the one you want is usually already there.
  `Button`, `Chip`, `Panel`, `Field`, `KeyCap`, `Findings`, `StatStrip`, `Icon`.
- **Two surfaces sharing a shape share the code.** Building the shell duplicated three
  things within an hour: the findings counts (three copies), the per-row thumbnail effect
  (two), and the horizontal stat strip (two). They are `components/Findings.tsx`,
  `lib/useThumbnail.ts` and `components/StatStrip.tsx` now, and `CaptureRow` serves the
  capture list, the Overview's Recent list and the resume card at three thumbnail sizes.
- **Capture formatting is `lib/capture.ts`, not a feature's file.** It was
  `features/home/format.ts` until two features needed it, which is the moment it stopped
  belonging to one. Same for `lib/hotkey.ts`, which was inside `HotkeyInput`.
- **Moving a control means giving it a new home in the same commit.** Taking "Open
  image…" out of the tray left it unreachable — handled in `index.ts`, exposed in
  `preload`, called by nothing. Two greps catch this class of mistake and are worth
  running after any move:

  ```bash
  # every preload method that no renderer calls
  grep -oE '^  [a-zA-Z][a-zA-Z0-9]*:' src/preload/index.ts
  # ...against
  grep -rhoE '\.[a-zA-Z0-9]+' src/renderer
  ```

  Currently 51 API methods, 0 unreachable.

- **Window management is `main/windows.ts`, not `index.ts`.** Five near-identical `open*Window`
  functions became one `openWindow(route)`; the capture overlay is deliberately not one of them,
  because it is created once and reused, shown and hidden rather than opened and closed, and revealed
  only when the renderer reports it painted.
- Hover states live in `tokens.css`, keyed on `data-` attributes — it is the one thing an inline
  style object cannot express. Focus rings are an `outline` there, since inline styles beat a
  stylesheet and most controls set their own `box-shadow`.
- A failure a user can see is reported to them (`notifyProblem`), not only to the console.
- Prettier: no semicolons, single quotes, width 110. Run `npm run format`.
- Comments earn their place or come out.

## Settled

- ~~**The library is a list, not a home.**~~ **Closed 2026-09-03.** It is a home: the list stays on
  the left and the capture is shown beside it. The shape borrows from Jam and Loom and the hosting
  does not — nothing is uploaded, no URL is minted, and the report is rendered from the bundle on
  this machine.
- ~~**`report.html` is written once and never regenerated.**~~ **Decided 2026-09-03: the file stays
  as written, and nothing in the app reads it.**

  The wart was that every improvement to the report reached new captures only, while
  `library:share` re-rendered and gave the current one — two reports for one capture. The home
  window renders on open, from the bundle's JSON, through the same `renderReport` call the share
  uses. So the three readers now agree, and the stale file is irrelevant to reading a capture
  in-app.

  It is deliberately **not** rewritten on open. Rewriting would mean a window that reads a capture
  mutating the capture, which is the wrong thing for a folder whose whole job is being evidence: a
  file's mtime would move because somebody looked at it, and a bundle copied to another machine
  would differ from the one it came from. `report.html` is the artifact **as captured** — what the
  session actually produced, openable by anyone with the folder and no snapit at all — and that is
  worth more than being current. Anyone wanting the current rendering has two ways to get one that
  do not involve rewriting history: open it in the app, or Share it.

  What this does cost: a bundle's own `report.html` ages, so an old folder handed over as a folder
  carries an old report. Share is the answer, and it is one button on the capture.

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
