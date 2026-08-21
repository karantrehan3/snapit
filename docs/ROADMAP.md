# snapit — Roadmap

> Supersedes the Phase 3–4 roadmap in [`DESIGN.md`](DESIGN.md), which is stale.
> Last updated: 2026-08-21. Current release: 3.2.0.

## Direction

snapit is a local-first capture tool that becomes the **verification layer** for software written by
agents. Two phases, in this order:

1. **Jam parity** — a capture stops being a loose file and becomes a bug report with context.
2. **Test writing** — the same captured context becomes Playwright integration tests, authored by
   Claude Code.

The sequencing is deliberate: Phase 2 needs a superset of what Phase 1 collects. Build Phase 1's
collector to Phase 2's requirements and Phase 2 is mostly a new MCP surface over data you already
have.

---

## The build-once rule

Phase 1 must capture four things it does not strictly need, because Phase 2 cannot be built without
them and retrofitting means re-recording every session.

| Captured in Phase 1                    | Phase 1 uses it for       | Phase 2 needs it for                                            |
| -------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| Timestamped action events              | Repro steps in the report | Correlating each step to a frame, a network window and a marker |
| ARIA snapshot before/after each action | The "what changed" line   | Generating assertions                                           |
| Marker notes (human intent)            | Human context on a report | Test naming and scenario boundaries                             |
| Network HAR + console, timestamped     | Failed-request list       | Asserting on API calls                                          |

Video plus a monotonic timeline serves both: watching the bug in Phase 1, baseline frames and
healing ground truth in Phase 2.

---

## Phase 1 — Jam parity

**Exit criteria:** a developer hits a bug, presses one key, and Claude Code receives the frame, the
console error, the failed request and the repro steps — without typing a description. A human opens
`report.html` and sees the same thing.

### M1.0 — Hygiene

No new features.

- **Re-enable the `T` text tool.** `STATUS.md` calls this an open blocker, but the fixes it lists as
  "already tried" are now in the code with comments asserting they work — the non-`screen-saver`
  always-on-top level (`main/index.ts:167`), `app.focus({ steal: true })` on reveal (`:182`) and a
  deferred textarea focus (`useAnnotationEditor.ts:125`). The tool is still filtered out of the
  toolbar (`Toolbar.tsx:69`) by a TODO pointing at the stale doc. Verify, then delete the filter. If
  it does still blur, the one untried fix is `preventDefault` on the stage mousedown in the text
  branch (`:244`) so the Konva canvas cannot take first-responder back inside the same gesture.
- **Redaction shape.** QA environments mirror production; redaction is table stakes. The background
  is a Konva `Image`, so this is a cropped second copy of it with a filter — mirror
  `mcp/region.ts`'s `toNativeCropRect` for the logical→source-pixel conversion, and cache at the
  export `pixelRatio` or the result comes out soft. Two modes, **solid by default** — pixelated and
  blurred text are both recoverable in some cases, so the safe one is not the opt-in.

**Deferred: notarization.** Decided 2026-08-21 — not doing it for now. The consequence is that
first launch still needs `xattr -dr com.apple.quarantine`, and ad-hoc-signed builds keep resetting
Privacy grants on every update. Both are real drags on adoption for a product whose ask is "trust me
with your screen," so this should be revisited before any wider release. When it comes back:
`build/afterPack.cjs` runs `codesign --force --deep` manually while `electron-builder.yml` sets
`identity: null`; notarization needs electron-builder to sign inside-out with hardened runtime and
entitlements, and Apple discourages `--deep`. That conflict is the trap, not the config.

### M1.1 — The bundle

- `<name>.snapit/` directory containing `capture.mp4` (or `.png`), `meta.json`,
  `annotations.json`, `report.html`, and later `console.json` / `network.har` / `actions.json`.
- `meta.json`: app version, OS and version, arch, displays with bounds and scale factors, locale,
  timezone, session start, duration, focused app/window trail, markers. All available from APIs
  already imported.
- `report.html` is self-contained: video, synced log gutter, metadata. No server, no viewer app,
  opens in any browser.
- **Do not slow the fast path.** The `⌘⇧9` screenshot-to-clipboard loop is what makes snapit good
  today. Bundles are a session mode, not a tax on every capture.
- `recent_captures` needs to understand directories, not just the four file extensions it filters on
  today.

### M1.2 — Markers and retro-buffer

- **`⌘⇧M` marker** during a session: one-line note, timestamped into the trail. This is also Phase
  2's intent channel — the single highest-value input to test generation, and it costs one text
  field.
- **Retro-buffer:** "save the last N seconds." Bugs are noticed _after_ they happen. This is the one
  capture feature Jam has and snapit does not, and the encoder is already incremental.

### M1.3 — The browser collector

- Launch Chrome with `--remote-debugging-port` and a **persistent** `--user-data-dir` (Chrome
  refuses remote debugging on the default profile; persisting our own means logins survive
  sessions). Connect with `playwright-core`'s `connectOverCDP` — one dependency that serves both
  phases, no bundled browser download needed.
- Collect console (`Runtime.consoleAPICalled`, `Log.entryAdded`), network (→ HAR, evaluate
  `chrome-har` before hand-rolling), navigations (`Page.frameNavigated`).
- **Action trail — encapsulate Playwright's recorder.** Do not hand-roll selector generation.
  Playwright's engine (testid preference, role + accessible name, disambiguation by nth) is years of
  tuning and is the single best thing to reuse here. snapit contributes the one thing the recorder
  has no notion of: a **timestamp per action**, so every step correlates to a video frame, a network
  window and a marker. That correlation is what makes assertions inferable, and codegen cannot
  supply it.
- **Spike before committing.** Playwright exposes no supported API for "hand me the recorded actions
  as data." The two routes are `context._enableRecorder()` (internal, underscore-prefixed) or
  shelling out to `playwright codegen` and reading the spec it emits. Verify which works over
  `connectOverCDP` against the user's _installed_ Chrome — Playwright's own browser download is
  ~150 MB and this app is already fighting its bundle size. Pin `playwright-core` to an exact
  version and add a smoke test that fails loudly on upgrade.
- **ARIA snapshot before and after each action** via `locator.ariaSnapshot()` — public, stable API.
  This is the assertion engine in Phase 2. See the build-once rule.
- **Redaction pass** before anything is written: strip auth headers, cookies and tokens from the HAR.
- Verify tracing fidelity over `connectOverCDP` early — it has documented limitations versus a
  Playwright-launched browser. If screenshots are degraded, keep snapit's own video and take only
  snapshots from the trace.

### M1.4 — MCP surface

- `start_session` / `stop_session` / `mark`
- `get_console_errors`, `get_failed_requests` — filtered and summarised, never raw
- `get_bundle_summary`, `get_step_detail`
- **Token discipline is the design constraint.** A 40-action session with full ARIA snapshots is
  hundreds of KB. Compact by default, zoom on request — the same call `include_image` already gets
  right.

### M1.5 — Handoff

- "Copy as Markdown" report for pasting anywhere.
- No Jira/Linear/Slack integrations. snapit writes a bundle; the agent that is already authenticated
  files the ticket. Zero OAuth, zero server, zero integration surface to maintain.

---

## Phase 2 — Playwright integration tests

Because M1.3 already captured a timestamped action trail, ARIA snapshots and intent markers, this
phase is mostly a new consumer of existing data.

**Division of labour:** snapit is the sensor, Claude Code is the author (it has the repo — fixtures,
conventions, existing specs), the user's repo is the runner. snapit never owns test execution or
ships its own Playwright version.

**Why not `playwright codegen`:** its recorder is fine, its generator is the weak half. Codegen
writes almost no assertions, guesses one selector with no knowledge of repo conventions, and emits a
linear script with no scenario structure. We reuse the recording approach and replace the generator.

### M2.0 — The codegen shortcut (ship this first)

The cheapest possible first deliverable, needing almost no new capture code: run a codegen session
inside snapit, take its **linear spec with no assertions**, and hand that to Claude _alongside the
Phase 1 bundle_. Claude upgrades the skeleton — adds assertions from the ARIA deltas and the HAR,
splits scenarios on marker boundaries, renames by intent, matches repo conventions.

Codegen supplies the mechanical 60% Playwright already solved. The bundle supplies the 40% codegen
structurally cannot: what each action was _supposed to accomplish_. Ship this and find out how good
the output is before investing in M2.1.

### M2.1 — Assertion inference

The ARIA delta plus the network window is what codegen never looks at:

| Observed delta                        | Generated assertion                           |
| ------------------------------------- | --------------------------------------------- |
| URL changed                           | `await expect(page).toHaveURL(…)`             |
| New node with `role=alert` / `status` | `expect(getByRole('alert')).toContainText(…)` |
| Text changed in place                 | Assert the new value                          |
| Node disappeared                      | `await expect(…).toBeHidden()`                |
| Successful POST + new list row        | Assert the row exists                         |
| 4xx / 5xx in the window               | Not an assertion — that is a bug, surface it  |
| Nothing meaningfully changed          | Likely a setup step, do not assert            |

Playwright's own `toMatchAriaSnapshot` (1.49+) means the output is idiomatic rather than invented.

**Hard part:** ARIA snapshots are noisy on animations, virtualised lists and volatile ids. The
pruning pass gates this milestone — getting it wrong produces confidently wrong assertions, which is
worse than none.

### M2.2 — Generation skill

Ship a skill with snapit, installed into the user's project: how to read a trail, match repo
conventions, apply the delta rules, split a linear trail into scenarios. Generation happens in the
user's Claude Code, against their repo. No API key in snapit, no inference cost, and it improves as
the model does.

### M2.3 — `promote_to_check`

Write the spec into the user's repo at a configurable path, capture baseline frames, keep the
original recording beside the check as the record of intent.

### M2.4 — `run_checks` and heal

Re-run on demand, report visual diffs back through MCP so an agent can verify its own work before
claiming to be done. When a selector breaks, the agent repairs it against the original recording —
snapit is the only tool that would hold the video, the DOM at that moment and an agent in the same
process.

---

## Decisions to settle before M1.1

1. **Bundle as directory or zip?** Recommend directory (inspectable, diffable) with export-to-zip on
   demand.
2. **rrweb DOM replay instead of video for web sessions?** Recommend no. It is a second capture
   engine to maintain and it does not serve the any-application identity that is snapit's moat.
3. **Must the collector use a snapit-launched browser?** Yes for v1. Attaching to an already-open tab
   in the user's normal Chrome requires an MV3 extension; build one only if that friction proves
   fatal.
4. **Where do generated specs land?** User's repo, configurable path. snapit never runs them.
5. **How much of Playwright's recorder do we encapsulate?** Decided: all of its selector generation,
   none of its output format. The emitted code is a skeleton, not the source of truth — it carries no
   timestamps, so it cannot be correlated to frames, network windows or markers.

## Scope discipline

Three fights to refuse:

- **Automating a browser the agent controls** — Playwright MCP and chrome-devtools MCP own it, are
  first-party and free. Compose, never duplicate.
- **Cloud bug reports with shareable links** — Jam and others own it. The bundle is the shareable
  unit.
- **Generating tests by reading the diff** — wrong end of the problem; it inherits the agent's own
  misreading of intent. snapit starts from an observed human demonstration.

## Not in scope

Cloud upload, shareable URLs, iOS capture, customer-facing recording links, network capture for
native applications (would need a TLS-intercepting proxy).

## Constraint carried forward

A native runtime port is still undecided, so keep collection at the protocol level. CDP over a
WebSocket is portable TypeScript; native input hooks are not. Nothing in M1.2–M1.3 should be built in
a way a port would have to throw away.
