# snapit — Design Document

> A local QA tool. Phase 1 is a faithful, cross-OS Lightshot-style screenshot tool.
> It then grows into screen recording, live browser-session analysis that auto-plans
> integration tests, and assisted form-fill for manual QA.

**Status:** Origin document. Partly superseded — see §0.
**Owner:** Karan Trehan (karantrehan3)
**Last updated:** 2026-06-15. Reconciled against what shipped: 2026-09-19.

---

## 0. Reconciliation (2026-09-19)

This is the June 2026 design, written before any code existed. It is kept rather than
rewritten because it is the only record of _why_ Electron, why Konva, and why a shell
hosting modules — and that reasoning held. Three assertions did not, and each is marked at
the section that makes it:

| This document says                                    | What shipped                                                                                                                                  | Where      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A companion MV3 Chrome extension observes the browser | Chrome is launched with a debugging port and observed over CDP through `playwright-core`. No extension was ever written.                      | §3, §4, §5 |
| `MediaRecorder` encodes the video                     | WebCodecs `VideoEncoder` through mediabunny. MediaRecorder is pinned to `latencyMode: 'realtime'` and cannot beat SSIM ~0.949 at any bitrate. | §5, §7     |
| Phase 4 is assisted form-fill                         | Not built, not planned, no code.                                                                                                              | §9         |

### Phase numbers mean `ROADMAP.md`, not this document

This document numbers its own four capabilities 1–4. [`ROADMAP.md`](ROADMAP.md) numbers
three different phases 1–3, and that is the numbering the code comments use — see
`collector/actions.ts:7`, where "Phase 2" means test generation and not screen recording.

**Unqualified, "Phase N" means `ROADMAP.md`.** The numbers here are left as written rather
than renumbered, because they are what the June commits and the original discussion refer
to. When reading this file, translate:

| This document                            | `ROADMAP.md`                                          |
| ---------------------------------------- | ----------------------------------------------------- |
| Phase 1 — screenshot                     | Phase 1, M1.0                                         |
| Phase 2 — recording                      | Phase 1, M1.2                                         |
| Phase 3 — live session analysis          | Phase 1 M1.3 (collection) + Phase 2 (generation)      |
| Phase 4 — assisted form-fill             | dropped                                               |
| "Future — cloud upload + shareable URLs" | Phase 3 — Teams, narrowed: the _customer_ operates it |

---

## 1. Vision

`snapit` is a desktop product that aids the QA process. It starts narrow — replicate
the Lightshot screenshot experience — and expands along a deliberate path:

1. **Screenshot** (MVP) — freeze the screen, select a region, annotate, save/copy.
2. **Recording** — capture screen video.
3. **Live session analysis** — observe what a tester does in a website and auto-plan
   integration tests from those actions.
4. **Assisted form-fill** — after a manual flow is performed once, help re-fill those
   fields on subsequent runs.

The product is **one app made of pluggable modules**, not a monolith and not four
separate apps.

**Outcome (2026-09-19).** Steps 1 and 2 shipped as described. Step 3 shipped, but split in
two and by a different mechanism: the observing half is `ROADMAP.md` M1.3 over CDP, and the
test-writing half is its Phase 2, authored by Claude Code rather than by snapit. Step 4 was
dropped — see §9. What the list did not anticipate is the thing snapit turned out to be
for: `ROADMAP.md`'s Direction now reads "the **verification layer** for software written by
agents", which is a sharper claim than "aids the QA process" and is what the MCP surface
exists to serve.

---

## 2. Goals / Non-Goals

### Goals

- A genuinely useful, fast, Lightshot-equivalent screenshot tool for QA — day one.
- Cross-OS from a single codebase (macOS-first; Windows/Linux for free).
- A modular architecture where each future capability is an independent module that
  plugs into a shared shell.
- Stay local-only at first: no servers, no data leaving the machine.
- Reuse the team's existing strengths: TypeScript, React, Playwright.

### Non-Goals (for now)

- ❌ Cloud upload / shareable public URLs (e.g. `prnt.sc`-style links) — **future**.
  **Amended 2026-09-19:** still true of _snapit-hosted_ anything, and now permanently so —
  `ROADMAP.md` puts "snapit-hosted storage of any kind" under Not in scope at any price. A
  shareable URL exists only inside a deployment the customer operates against a bucket the
  customer owns, which is Phase 3 there. The line being drawn is who runs it.
- ❌ Mobile / native app rewrites.
- ❌ Replacing Team Aegis — `snapit` _feeds_ the Playwright/QA pipeline, it doesn't
  replace it.
- ❌ A fully autonomous "AI writes perfect tests" promise — Phase 3 is assistive R&D.

---

## 3. Decisions (locked) and their rationale

| Decision          | Choice                            | Why                                                                                                                                   |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Product shape     | Shell hosting pluggable modules   | OS-level capture and browser-level observation cannot share one process; modules let one product span both worlds                     |
| Shell framework   | **Electron + TypeScript**         | Whole product (shell, canvas, extension, test-gen) is one language the team knows; cross-OS for free; mature capture + clipboard APIs |
| Browser hook      | **Companion Chrome extension**    | QA keeps their real authenticated Chrome (real app logins/cookies); native access to DOM/network/form events                          |
| Phase 1 sharing   | **Local only** (disk + clipboard) | Truest to "local QA tool"; avoids PII-in-the-cloud governance; cloud is a clean future add                                            |
| Annotation engine | **Konva.js** (on React)           | Best fit for selectable / movable / resizable shapes + text with live-editable color and size                                         |

**What held, and what did not (2026-09-19).** Four of the five are unchanged after a year
and a 4.0 release: the shell-plus-modules shape, Electron, local-only sharing, and Konva.
"Local only" in particular got _stronger_ rather than weaker — M1.6 made the bundle a
single self-contained `.html`, which is a better answer to sharing than the cloud upload
this table deferred.

**The browser hook is the one that was wrong**, and it was wrong in a useful direction. An
MV3 extension was never written. M1.3 found that launching Chrome with
`--remote-debugging-port` and attaching over CDP through `playwright-core` gets the DOM,
the network and the form events with no extension to publish, no store review and no
service-worker lifecycle to fight. What it costs is the thing this table was buying: the
tester does not get their own already-open, already-authenticated Chrome, they get a
snapit-launched profile — persisted, so signing in to the app under test is a
once-per-machine cost rather than once-per-session. `ROADMAP.md`'s _Decisions to settle_ #3
records that trade and leaves the extension as the escape hatch if the friction proves
fatal. It has not.

### The fault line this resolves

The four phases live in two different worlds:

- **Phases 1–2 (screenshot, video)** are _OS-level_ — capture any pixel on screen.
- **Phases 3–4 (observe actions, fill fields)** are _browser-level_ — only observable
  from inside a browser.

A desktop app can't see DOM clicks; a browser extension can't screenshot your IDE.
The **shell + modules** architecture is precisely what bridges them: the shell and
capture run OS-level; the observer/test-gen/field-memory modules run inside Chrome via
the companion extension and talk back to the shell over a local channel.

**The fault line is real and the bridge is not the one described.** Nothing runs inside
Chrome. The collector runs in snapit's own main process and reaches into the browser over
CDP, which is the same bridge with the modules on the other side of it — snapit observes
Chrome rather than living in it. `ROADMAP.md`'s _Constraint carried forward_ is what keeps
that decision cheap: collection stays at the protocol level, because CDP over a WebSocket is
portable TypeScript and native input hooks are not, and a runtime port is still
undecided.

---

## 4. Architecture

```
                          ┌─────────────────────────────────────┐
                          │            snapit (Electron)          │
                          │                                       │
  Global hotkey  ───────► │  Shell: tray, hotkey, settings, IPC,  │
                          │         local storage, window mgmt    │
                          │                                       │
                          │  ┌─────────────┐  ┌────────────────┐  │
                          │  │ Capture mod │  │ Annotation mod │  │
                          │  │ (screenshot │  │ React + Konva  │  │
                          │  │  + video)   │  │ overlay canvas │  │
                          │  └─────────────┘  └────────────────┘  │
                          └───────────────▲───────────────────────┘
                                          │ local WebSocket / native messaging
                                          │ (Phase 3+)
                          ┌───────────────┴───────────────────────┐
                          │     Companion Chrome Extension (MV3)    │
                          │  content script: DOM / network / form   │
                          │  event recorder  ──►  Test-gen module   │
                          │                       Field-memory mod  │
                          └─────────────────────────────────────────┘
```

- **Shell** owns lifecycle: runs once in background, lives in the tray, registers the
  global hotkey, manages windows, settings, and local storage. Single source of IPC.
- **Capture module** (OS-level): freeze-frame screenshot + (Phase 2) video.
- **Annotation module**: a React app rendering a Konva canvas in a fullscreen overlay
  window.
- **Browser-observer module** (Phase 3+): a Manifest V3 Chrome extension whose content
  script records DOM/network/form events and streams them to the shell.
- **Test-gen module** (Phase 3): consumes recorded actions → emits Playwright `.spec.ts`.
- **Field-memory module** (Phase 4): records form values once, replays them later.

**As built (2026-09-19).** The top half is accurate. The bottom half never existed: there is
no extension, no content script and no native messaging, and the last three bullets describe
modules that either live in the main process or were dropped.

```
                          ┌───────────────────────────────────────┐
                          │          snapit (Electron)            │
  Global hotkey  ───────► │  Shell: tray, hotkey, settings, IPC,  │
                          │         save folder, window mgmt      │
                          │                                       │
                          │  ┌─────────────┐  ┌────────────────┐  │
                          │  │ Capture mod │  │ Annotation mod │  │
                          │  │ screenshot  │  │ React + Konva  │  │
                          │  │ + recording │  │ overlay canvas │  │
                          │  └─────────────┘  └────────────────┘  │
                          │  ┌─────────────┐  ┌────────────────┐  │
                          │  │ Collector   │  │ MCP server     │◄─┼── Claude Code
                          │  │ (main proc) │  │ 127.0.0.1 only │  │   (bearer token)
                          │  └──────┬──────┘  └────────────────┘  │
                          └─────────┼─────────────────────────────┘
                                    │ CDP over a WebSocket (playwright-core)
                          ┌─────────┴─────────────────────────────┐
                          │  Chrome, launched by snapit with      │
                          │  --remote-debugging-port, persisted   │
                          │  profile. Console · HAR · actions ·   │
                          │  ARIA snapshots, all timestamped.     │
                          └───────────────────────────────────────┘
```

Two differences worth naming rather than just redrawing:

- **The collector is a module in the main process, not code in the page.** Only an injected
  binding for action events runs in the page; everything else is CDP. That is what
  `ROADMAP.md`'s _Constraint carried forward_ is protecting.
- **The MCP server is the module this design did not foresee at all**, and it is the one
  that makes snapit a verification layer rather than a capture tool. A local HTTP server on
  loopback behind a per-install bearer token, so an agent asks snapit what happened instead
  of a human describing it.

---

## 5. Tech stack

| Concern               | Choice                                           | Notes                                     |
| --------------------- | ------------------------------------------------ | ----------------------------------------- |
| Desktop runtime       | Electron + TypeScript                            | cross-OS, macOS-first                     |
| Build tooling         | electron-vite                                    | fast HMR, TS-native                       |
| UI / canvas           | React + Konva.js                                 | annotation objects, selectable color/size |
| Screen capture        | `desktopCapturer` + `nativeImage`                | full-res freeze-frame, clipboard image    |
| Global hotkey         | `globalShortcut`                                 | configurable                              |
| Tray / background     | `Tray`                                           | run-once-in-background                    |
| Packaging             | electron-builder                                 | macOS `.dmg`, notarization later          |
| Video (P2)            | `MediaRecorder` over capture stream              | `.webm` / `.mp4`                          |
| Browser observer (P3) | Chrome extension (MV3, TS)                       | content + background scripts              |
| Test generation (P3)  | Playwright `codegen`/trace base + custom emitter | outputs Playwright TS specs               |
| Field memory (P4)     | extension storage + local encrypted store        | PII/secret handling TBD                   |

**Corrections (2026-09-19).** The first seven rows are what shipped. The last four are not:

| Row                  | What shipped                                                      | Why it changed                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Video**            | WebCodecs `VideoEncoder` + `mediabunny`, `.mp4`; `gifenc` for GIF | Measured: `MediaRecorder` is locked to `latencyMode: 'realtime'` and saturates at SSIM ~0.949 at any bitrate. WebCodecs with `bitrateMode: 'quantizer'` reaches 0.9895 at 27% fewer bits — the per-frame quantizer control OBS relies on. Also the only path that can buffer packets, which is what M1.2's retro-buffer needs. |
| **Browser observer** | `playwright-core` over CDP to a snapit-launched Chrome            | No extension to publish or review, and no MV3 service-worker lifecycle. See §3.                                                                                                                                                                                                                                                |
| **Test generation**  | snapit emits a timestamped skeleton; Claude Code authors          | `codegen`'s recorder is fine and its generator is the weak half — almost no assertions, one guessed selector, no scenario structure, and no timestamps, so its output cannot be correlated to frames or network windows. M2.0 kept the selector generation and replaced the emitter.                                           |
| **Field memory**     | —                                                                 | Dropped. See §9.                                                                                                                                                                                                                                                                                                               |
| **Agent surface**    | MCP over local HTTP (`@modelcontextprotocol/sdk`), bearer token   | Not foreseen here at all, and now the reason the product exists in the shape it does.                                                                                                                                                                                                                                          |

---

## 6. Phase 1 — Lightshot-equivalent screenshot (MVP)

### 6.1 User flow (target experience)

1. App is launched once; it lives in the macOS tray/menubar and runs in the background.
2. User presses the configured **global hotkey**.
3. The screen **freezes to the current frame** (a full-screen still is captured and
   shown beneath a fullscreen, always-on-top, click-through-disabled overlay).
4. User **drags a rectangle** to select the region to capture; everything outside the
   selection is dimmed.
5. A floating toolbar appears with annotation tools: **rectangle, arrow, line, text,
   freehand/pen**, plus **color picker** and **size/thickness** control.
6. Annotation objects remain **selectable, movable, and resizable** after being drawn;
   their color and size can be changed after the fact.
7. User chooses an output: **save to disk** or **copy to clipboard** (for pasting into
   Jira / Slack / anywhere).
8. Overlay closes, screen unfreezes.

### 6.2 Freeze-frame technical approach

- On hotkey, request `desktopCapturer.getSources({ types: ['screen'] })` with
  `thumbnailSize` set to the **true screen resolution including Retina `scaleFactor`**
  (otherwise annotations land on a blurry, downscaled image).
- Create a borderless, transparent, always-on-top `BrowserWindow` sized to the active
  display; render the captured still as the background, with the Konva overlay on top.
- Multi-monitor: capture the display under the cursor first; full multi-display support
  is a fast-follow.

### 6.3 Annotation object model (Konva)

Each annotation is a serializable object: `{ id, type, x, y, w, h, points?, color,
strokeWidth, fontSize?, text? }`. Tools push objects onto a layer; a transformer
handles select/move/resize. This model also makes future "edit a saved screenshot"
trivial.

### 6.4 Output

- **Disk**: configurable save directory, timestamped filename, PNG.
- **Clipboard**: `clipboard.writeImage(nativeImage)` so the user can paste directly.

### 6.5 Settings

- Configurable global hotkey.
- Default save directory.
- Default tool / color / size.

### 6.6 Milestones

| ID  | Milestone | Output                                                                         |
| --- | --------- | ------------------------------------------------------------------------------ |
| 1a  | Skeleton  | Electron+TS tray app, global hotkey, fullscreen transparent overlay            |
| 1b  | Capture   | Freeze-frame at true resolution, drag-to-select crop                           |
| 1c  | Annotate  | Konva canvas: rect/arrow/line/text/pen; color+size pickers; select/move/resize |
| 1d  | Output    | Save-to-disk + copy-to-clipboard; settings panel                               |

---

## 7. Phase 2 — Screen recording

> **Built, and not this way.** See the Video row in §5's corrections. Everything below is
> accurate except the encoder: the stream is reused as described and the selection UI was
> reused as predicted, but `MediaRecorder` was measured and replaced. `ROADMAP.md` M1.2 has
> the retro-buffer work that followed from it.

- Reuse the capture stream from `desktopCapturer`; pipe to `MediaRecorder`.
- Output `.webm` (and/or `.mp4`); save to disk.
- Region/window/full-screen selection reuses Phase 1's selection UI.

---

## 8. Phase 3 — Live session analysis → integration test planning _(R&D)_

> **Superseded by [`ROADMAP.md`](ROADMAP.md).** The observing half shipped as M1.3, over CDP
> rather than an extension; the generating half is its Phase 2, with Claude Code as the
> author. Two predictions in this section are worth keeping score on. It was right that
> planning is the hard part and recording is not. It was wrong that "codegen gets ~60% for
> free" — M2.0 found `_enableRecorder` optional and built a trail richer than codegen's,
> and the 60% turned out to be the half that was already cheap. Read that section, not this
> one; this is kept for the framing.

The most ambitious phase. The companion Chrome extension records the tester's actions
on a real website; `snapit` turns them into **Playwright test specs**.

- **Observe**: MV3 content script captures clicks, inputs, navigations, network calls,
  and stable selectors (prefer `data-testid`, role, accessible name).
- **Transport**: stream events to the shell over a local WebSocket or Chrome
  native-messaging (decision deferred to this phase).
- **Generate**: Playwright's own `codegen`/trace gets ~60% for free (record → code).
  The differentiated, genuinely hard part is _planning_ meaningful tests: grouping
  actions into scenarios, inferring assertions, and proposing edge cases.
- **Output**: `.spec.ts` files that fit the Team Aegis / `playwright-e2e` conventions.

**Open question:** confirm the test output format = Playwright TS specs aligned to the
existing `playwright-e2e` skill.

---

## 9. Phase 4 — Assisted form-fill

> **Dropped (2026-09-19).** Never started, and no longer planned. Two reasons, and the
> second is the real one.
>
> The open question below was the blocker and it never got easier: a QA environment mirrors
> production, so the field values a tester types are exactly the values that must not be
> persisted. Storing them is a PII posture snapit has otherwise avoided entirely — the
> collector _redacts_ credentials on the way out (`collector/redact.ts`), and a
> field-memory module would be the one component deliberately keeping them.
>
> And it is now redundant. This existed to spare a tester re-typing a flow. `ROADMAP.md`
> Phase 2 emits a Playwright spec from the same recorded actions, so the flow is re-run by
> a test rather than re-typed by a human with help. A feature that half-automates what
> another feature fully automates is not worth a PII store.

- After a manual flow is performed once, record the field values the tester entered.
- On a later run, offer to re-fill those fields.
- **Open question:** where recorded values live and how secrets/PII are handled
  (encryption at rest, opt-out for sensitive fields).

---

## 10. Risks

| Risk                                                             | Severity | Mitigation                                                                       |
| ---------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| macOS Screen Recording permission not granted → black frames     | High     | First-launch onboarding that detects + guides the permission grant               |
| Freeze-frame blurry (wrong resolution / Retina)                  | Medium   | Always capture at true `scaleFactor`-aware resolution                            |
| Phase 3 "auto-plan tests" overpromises                           | Medium   | Treat as assistive R&D; lean on Playwright codegen; never let it gate Phases 1–2 |
| Extension ↔ shell IPC reliability (MV3 service-worker lifecycle) | Medium   | Decide transport at Phase 3; design for reconnect                                |
| PII in screenshots/recordings (test envs hold customer data)     | Medium   | Local-only by default; revisit before any cloud feature                          |

**Scored (2026-09-19).** Five risks, and the two that mattered were not the two rated High
and Medium-with-a-plan:

| Risk                           | Outcome                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen Recording permission    | **Real, mitigated as planned.** First-run onboarding exists. The unforeseen cousin is worse and is still open: ad-hoc-signed builds reset Privacy grants on every update, which is why `ROADMAP.md` M1.0 puts notarization last but not never.                                                                                    |
| Freeze-frame blurry            | **Real, solved as planned** — `scaleFactor`-aware capture throughout.                                                                                                                                                                                                                                                             |
| "Auto-plan tests" overpromises | **Mitigated by changing who does it.** snapit does not plan tests; it emits a timestamped trail and Claude Code authors. The overpromise was avoided by giving the hard half away.                                                                                                                                                |
| Extension ↔ shell IPC          | **Retired.** There is no extension, so the MV3 service-worker lifecycle never had to be fought. See §3.                                                                                                                                                                                                                           |
| PII in captures                | **The one that grew.** Rated Medium; it is the constraint that has shaped the most decisions since — redaction on the collector's way out, credentials stripped before a HAR is written, and the whole of M1.7's argument. "Revisit before any cloud feature" was the right instruction and `ROADMAP.md` Phase 3 is that revisit. |

**Not on this list and should have been:** encoder quality. The largest single measured
finding in the project's history is that `MediaRecorder` has a hard quality ceiling, and
nothing here anticipated that the recording format would need original measurement at all.

---

## 11. Open questions (non-blocking for Phase 1)

- Phase 3 test output format — assume Playwright TS specs; confirm at Phase 3.
- Extension↔shell transport — local WebSocket vs native messaging; decide at Phase 3.
- Phase 4 field storage + secret handling.
- Multi-monitor support depth for Phase 1 (cursor-display first).

**Answered (2026-09-19).** All four are closed; the live ones now live in `ROADMAP.md`'s own
_Decisions to settle_ sections.

1. **Test output format** — Playwright TS specs, confirmed. Where they _land_ is less
   settled than `ROADMAP.md`'s _Decisions to settle_ #4 implies: today `specgen.ts` writes
   `generated.spec.ts` into the bundle, and there is no repo-path setting. Getting it into a
   repo is Claude Code's job over MCP, which is consistent with the division of labour but
   is not the configurable path that decision describes. snapit does not run specs — there
   is no `spawn` anywhere near them.
2. **Transport** — neither. CDP over a WebSocket to a snapit-launched Chrome, because there
   is no extension to transport from.
3. **Field storage** — moot; §9 is dropped.
4. **Multi-monitor** — shipped beyond "cursor-display first": `meta.json` records every
   display's bounds and scale factor, which the report uses to state the environment.

---

## 12. Roadmap

> **Superseded entirely by [`ROADMAP.md`](ROADMAP.md), which is the live plan.** This list
> is the June 2026 ordering and is kept only as the origin of the numbering §0 explains.
> Nothing should be planned against it.

1. **Phase 1** — Lightshot-equivalent screenshot (1a → 1d). _Shipped._
2. **Phase 2** — screen recording. _Shipped, different encoder (§7)._
3. **Phase 3** — companion extension + test generation (R&D). _Split: collection shipped
   over CDP, generation is `ROADMAP.md` Phase 2._
4. **Phase 4** — assisted form-fill. _Dropped (§9)._
5. **Future** — cloud upload + shareable URLs; integration-native share (attach to Jira,
   post to Slack). _Became `ROADMAP.md` Phase 3, narrowed: snapit ships a server, the
   customer operates it, and snapit hosts nothing._

---

## Appendix A — Repo

- Separate GitHub repo: `github.com/karantrehan3/snapit`.
- Single TypeScript monorepo: `shell/`, `modules/`, `extension/` (added at Phase 3).

**As built (2026-09-19).** The planned layout never existed; none of those three
directories were created. electron-vite's own convention won, and the module boundaries
this design wanted are directories inside it rather than packages:

```
src/
├── main/               the shell: hotkeys, windows, settings, IPC, save folder
│   ├── collector/      the browser observer, over CDP
│   └── mcp/            the local MCP server
├── preload/            the single IPC surface
└── renderer/src/
    ├── features/       one directory per surface — shell, captures, record,
    │                   screenshot, annotate, annotate-live, edit, gif, session,
    │                   gallery, settings, welcome, about
    ├── components/     shared UI
    ├── lib/
    └── styles/
server/                 connected-mode prototype (ROADMAP.md Phase 3) — imported by nothing
```

So the module boundary this design wanted is real, but it is a directory convention rather
than a package boundary — and it landed in `features/`, a finer grain than the four modules
§4 imagined.

Tests sit in a `tests/` folder next to the code they cover, which is why `vitest.config.ts`
includes `src/**/tests/**/*.spec.ts` rather than a top-level `test/`.
