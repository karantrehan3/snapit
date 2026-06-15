# snapit — Design Document

> A local QA tool. Phase 1 is a faithful, cross-OS Lightshot-style screenshot tool.
> It then grows into screen recording, live browser-session analysis that auto-plans
> integration tests, and assisted form-fill for manual QA.

**Status:** Draft / pre-implementation
**Owner:** ktrehan@jrni.com
**Last updated:** 2026-06-15

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
- ❌ Mobile / native app rewrites.
- ❌ Replacing Team Aegis — `snapit` _feeds_ the Playwright/QA pipeline, it doesn't
  replace it.
- ❌ A fully autonomous "AI writes perfect tests" promise — Phase 3 is assistive R&D.

---

## 3. Decisions (locked) and their rationale

| Decision          | Choice                            | Why                                                                                                                                         |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Product shape     | Shell hosting pluggable modules   | OS-level capture and browser-level observation cannot share one process; modules let one product span both worlds                           |
| Shell framework   | **Electron + TypeScript**         | Whole product (shell, canvas, extension, test-gen) is one language the team knows; cross-OS for free; mature capture + clipboard APIs       |
| Browser hook      | **Companion Chrome extension**    | QA keeps their real authenticated Chrome (real JRNI logins/cookies for Studio + Customer Journey); native access to DOM/network/form events |
| Phase 1 sharing   | **Local only** (disk + clipboard) | Truest to "local QA tool"; avoids PII-in-the-cloud governance; cloud is a clean future add                                                  |
| Annotation engine | **Konva.js** (on React)           | Best fit for selectable / movable / resizable shapes + text with live-editable color and size                                               |

### The fault line this resolves

The four phases live in two different worlds:

- **Phases 1–2 (screenshot, video)** are _OS-level_ — capture any pixel on screen.
- **Phases 3–4 (observe actions, fill fields)** are _browser-level_ — only observable
  from inside a browser.

A desktop app can't see DOM clicks; a browser extension can't screenshot your IDE.
The **shell + modules** architecture is precisely what bridges them: the shell and
capture run OS-level; the observer/test-gen/field-memory modules run inside Chrome via
the companion extension and talk back to the shell over a local channel.

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

- Reuse the capture stream from `desktopCapturer`; pipe to `MediaRecorder`.
- Output `.webm` (and/or `.mp4`); save to disk.
- Region/window/full-screen selection reuses Phase 1's selection UI.

---

## 8. Phase 3 — Live session analysis → integration test planning _(R&D)_

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

---

## 11. Open questions (non-blocking for Phase 1)

- Phase 3 test output format — assume Playwright TS specs; confirm at Phase 3.
- Extension↔shell transport — local WebSocket vs native messaging; decide at Phase 3.
- Phase 4 field storage + secret handling.
- Multi-monitor support depth for Phase 1 (cursor-display first).

---

## 12. Roadmap

1. **Phase 1** — Lightshot-equivalent screenshot (1a → 1d).
2. **Phase 2** — screen recording.
3. **Phase 3** — companion extension + test generation (R&D).
4. **Phase 4** — assisted form-fill.
5. **Future** — cloud upload + shareable URLs; integration-native share (attach to Jira,
   post to Slack).

---

## Appendix A — Repo

- Location: `../snapit` (i.e. `…/JRNI/core/snapit`), separate GitHub repo.
- Single TypeScript monorepo: `shell/`, `modules/`, `extension/` (added at Phase 3).
