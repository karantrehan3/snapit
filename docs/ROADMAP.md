# snapit — Roadmap

> Supersedes the Phase 3–4 roadmap in [`DESIGN.md`](DESIGN.md), which is stale.
> Last updated: 2026-09-03. Current release: 3.2.0.

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

**Met, 2026-08-22.** M1.0 through M1.5 are built, and failed responses carry their bodies as of
2026-08-23.

Two gaps remain, both deliberate rather than forgotten:

- ~~A recording and a browser session write separate bundles.~~ **Fixed 2026-08-23.** A session owns
  one bundle and one origin; a recording started while it runs writes its media there and reports
  where it began relative to that origin. `videoTimeSec` converts any session-clock moment onto the
  video's clock, so a repro step or a console error seeks the recording to the frame it happened on.
  A recording taken with no session open still writes its own bundle exactly as before.
- **The retro buffer cannot be armed in the background.** What shipped trims a recording you
  started; instant replay means buffering with no session at all. A posture change, not an encoder
  problem — the encoder is ready.

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

**Notarization is the last item, immediately before a wider release.** Deferred 2026-08-21, position
fixed 2026-08-23. It gates nothing else — no feature depends on it — so it earns nothing by being
done earlier, and doing it now would mean carrying a paid certificate and a notarisation step
through every build in between. Meanwhile first launch needs `xattr -dr com.apple.quarantine` and
ad-hoc-signed builds reset Privacy grants on every update, which is a drag on development but only
a real cost once other people are installing it.

When it comes back, the trap is not the config: `build/afterPack.cjs` codesigns manually with
`--deep` while `electron-builder.yml` sets `identity: null`, and notarization needs electron-builder
to sign inside-out with hardened runtime and entitlements, with `--deep` discouraged by Apple. That
conflict has to be resolved first.

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
  capture feature Jam has and snapit does not.

  **Finding (2026-08-22): not a small change, and audio is the blocker.** `mp4Encoder` is a
  single-shot pipeline — `Output` + `BufferTarget` accumulates the whole muxed file, every packet
  goes straight into `EncodedVideoPacketSource`, and finalize writes an index over all of it. There
  is no way to drop the beginning. The right shape is to hold packets in a ring trimmed at keyframe
  boundaries (`KEY_FRAME_INTERVAL_SEC` already gives regular ones) and only create the `Output` at
  save time, rebasing timestamps to zero — `videoSource.add()` is already the funnel, it just gets
  deferred. But audio is handed to mediabunny wholesale via `MediaStreamAudioTrackSource`, which
  pulls from the live track and encodes AAC itself, with no packet-level hook to trim. So:

  - **silent recording** (⌘⇧7) — clean, the ring-buffer approach works as-is;
  - **video with audio** (⌘⇧8) — needs the audio path rebuilt around `AudioEncoder` so its packets
    can be buffered too, or video starts N seconds back while audio starts at zero and the two
    desync.

  **Built (2026-08-22).** `createRetroEncoder` defers all muxing to `finish()`, holding encoded
  video packets and raw PCM in a ring pruned at each keyframe. Audio moved off
  `MediaStreamAudioTrackSource` onto `MediaStreamTrackProcessor` + `AudioSampleSource`, so mediabunny
  still does the AAC encoding but only over the retained window. `createMp4Encoder` is untouched and
  still handles every untrimmed recording. Trimming also rebases the reported duration and the
  markers, which would otherwise both point past the end of the file.

  **Still open: arming it in the background.** What shipped trims a recording you started — you must
  still have pressed record. The ShadowPlay reading of "bugs are noticed after they happen" needs
  snapit buffering continuously with no active session, which is a posture change (always-capturing
  tray state, a visible armed indicator, battery cost) rather than an encoder problem. The encoder
  is ready for it; the product decision is not made.

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
- **Spike run 2026-08-22 — every question came back yes.** Against installed Chrome 151 with
  `playwright-core` 1.62.1 and a throwaway profile:

  | Question                                      | Result                                                    |
  | --------------------------------------------- | --------------------------------------------------------- |
  | `connectOverCDP` without `playwright install` | Works. `playwright-core` downloads no browser at all      |
  | `context.tracing` fidelity over CDP           | Full trace: 7 screenshots, `trace.network`, DOM snapshots |
  | `locator.ariaSnapshot()`                      | Works, and reflects post-action state                     |
  | `context._enableRecorder()` (internal)        | Present and callable                                      |
  | Raw CDP console / network                     | Both captured                                             |
  | `Runtime.addBinding` action trail             | Fires with our payload                                    |

  **The important consequence: `_enableRecorder` is optional.** Raw CDP plus `addBinding` plus
  `ariaSnapshot` already covers everything the collector needs, all on supported APIs. And an ARIA
  snapshot yields role and accessible name, which is most of a good selector — `getByRole('button',
{ name: 'Add item' })` — so selector generation does not have to depend on the unsupported
  internal either. Reach for `_enableRecorder` only for disambiguation, pinned, behind a smoke test.

- **ARIA snapshot before and after each action** via `locator.ariaSnapshot()` — public, stable API.
  This is the assertion engine in Phase 2. See the build-once rule.
- **Redaction pass** before anything is written: strip auth headers, cookies and tokens from the HAR.
- ~~Verify tracing fidelity over `connectOverCDP`~~ — done, see the spike table. Screenshots are
  present, so the trace can stand alongside snapit's own video rather than replacing it.

**Built (2026-08-22).** Tray → "Start browser session…" launches Chrome under snapit's control;
stopping it writes a bundle with `console.json`, `network.har`, `actions.json`, `meta.json` and a
report showing steps to reproduce, failed requests and the console. Verified end-to-end against real
Chrome by driving the collector's own browser with Playwright.

Two leaks the live runs caught that reasoning had not:

- Passing the target URL at launch lost every request the first page load made, because Chrome
  starts fetching the moment it has a URL and `Network.enable` is per-session. Launch blank, attach,
  then navigate.
- `ariaSnapshot()` includes input values, so a snapshot taken after someone types into a login form
  carried their password in plain text — a second route entirely from the action trail, which
  redacts properly. All typed values are now stripped from snapshots.

~~**Still open:** response bodies are absent from the HAR, and a recording and a session write
separate bundles.~~ **Both closed.** One bundle per session since 2026-08-23. Bodies arrived for
failures on 2026-08-23 and widened on 2026-08-31 to every XHR/fetch under 32 KB — resource type
first, size second, the line Jam draws. `STATUS.md` has the measurements.

**Verified end to end 2026-09-03**, against real Chrome over CDP with a loopback fixture making one
request of every shape the policy sorts on. It caught a third leak that reasoning had not, in the
same family as the first two: `stop()` disconnected before the response bodies it had asked for came
back, and before the events that decide whether to ask. Stopping straight after the last request lost
all of them — invisible from the tray, where a human takes seconds to click, and exactly what
`stop_browser_session` does when an agent is driving. `stop()` now flushes and drains, both capped.
See `STATUS.md`.

### M1.4 — MCP surface

**Built (2026-08-22).** Six tools: `start_browser_session`, `stop_browser_session`,
`get_session_summary`, `get_console_errors`, `get_failed_requests`, `get_steps`. `bundle` is optional
everywhere and defaults to the most recent, since that is almost always the one being asked about.

Token discipline drove every shape: `get_steps` lists one line per action with no selectors and no
snapshots, and the same tool with a `step` returns that step's detail — the progressive disclosure
`include_image` already applies to screenshots. Console output collapses identical messages into one
line with a count, because a loop logging the same failure four hundred times is one problem.

`mark` was deliberately dropped. Every tool costs context in every session that connects, and an
agent marking a moment in a recording it is not watching earns less than it costs — the ⌘⇧M hotkey
covers the case that matters.

A bundle name arriving from a model is untrusted: `resolveBundleDir` refuses anything resolving
outside the save folder rather than clamping it, since a silently rewritten path would read the
wrong bundle and look like it worked.

### M1.5 — Handoff

**Built (2026-08-22).** Tray → "Copy last report as Markdown" puts the newest bundle on the clipboard
as a paste-ready report: repro steps, failed requests, console with repeat counts, markers, and the
environment. Console output is fenced because it is arbitrary text from someone else's application,
and URLs go in inline code with backticks swapped out — an unbalanced one would end the span early
and spill raw text into whatever it was pasted into.

Tray only, no MCP tool: an agent already has `get_steps`, `get_console_errors` and
`get_failed_requests` and can compose a better ticket than a fixed template, and every tool costs
context in every session that connects.

No Jira/Linear/Slack integrations, as planned. Whoever files the ticket is already signed in to it,
and a paste costs them one keystroke against an OAuth flow and a token to keep alive here.

### M1.6 — Sharing a capture

**The tension, before it is resolved.** A capture is a folder, and everything in it is addressed by
relative path, so it works where it was written and nowhere else. The only way to hand one to
somebody today is Copy as Markdown, which drops the video, the timeline and the network. That is a
real gap — and closing it looks exactly like the thing this roadmap refuses. "Cloud upload,
shareable URLs" is listed under Not in scope, and "cloud bug reports with shareable links" is one of
the three fights to refuse.

**Recommendation: build the file, keep refusing the service.** What Scope discipline is protecting
is not sharing, it is not operating infrastructure — an account system, a bucket, a retention
policy, and a PII posture over QA environments that mirror production. None of that is required to
put a whole report in someone else's hands. A single self-contained `.html` reaches the recipient
with no server, no account and nothing leaving the machine except the file the user sent
themselves. It makes the existing position — "the bundle is the shareable unit" — true, where today
the bundle is shareable only in the sense that a folder can be zipped and reassembled by someone who
knows what to do with it.

So the refusal narrows to what it always meant, and nothing in it is reversed: snapit does not
upload, does not mint URLs, does not host, and never learns who opened a report. `Not in scope`
keeps "cloud upload" and "customer-facing recording links" and loses nothing.

The cost is honest and it is size. Base64 inflates the recording by a third, and the recording is
almost all of the file — measured numbers and the thresholds derived from them are in
`STATUS.md`. Above the threshold the export offers to leave the video out rather than producing an
attachment nobody can send.

**Built (2026-08-25).** Library → Share. One `.html` holding the video as a data URI, the report,
and `meta.json` / `console.json` / `network.har` / `actions.json` / `generated.spec.ts` as
download links off data URIs, so the recipient can still hand the HAR to a viewer or the trail to
their own agent. The media is streamed through a base64 encoder into the output file rather than
`readFile` → `toString('base64')`: measured on a 167 MB recording, 215 MB of resident memory
against 1.15 GB, and 280 ms against 1598 ms. The peak does not grow with the recording — a 560 MB
one costs the same 213 MB.

### M1.7 — A link, without snapit operating a service

Not built. Proposed only, and deliberately: it needs a decision, and the single file may well make
it unnecessary.

The single file solves distribution the way an attachment does. What it does not solve is the case
where the destination only takes a URL — a Jira description, a Slack channel where a 30 MB
attachment is refused, a PR comment. Jam's answer is its own cloud. snapit's, if it wants one at
all, is to upload the same file to infrastructure the user already trusts and already pays for:

| Target                  | What snapit would need           | What it costs                                     |
| ----------------------- | -------------------------------- | ------------------------------------------------- |
| User's S3 bucket        | Credentials, a PUT, a URL scheme | A credential in settings, and the AWS SDK         |
| GitHub gist             | A token, `gh gist create`        | Gists are not private enough for a QA environment |
| Internal share / WebDAV | A path, or a PUT with basic auth | Nothing; it is a file copy                        |

The honest costs, in order:

1. **A stored credential.** snapit holds no user secret today beyond its own MCP token. An S3 key in
   `settings.json` is a new class of thing to protect, and the first thing an attacker with read
   access to the machine would want.
2. **Support surface without control.** A bucket with the wrong CORS or ACL produces a link that
   works for the user and 403s for everyone else, and snapit gets blamed for it.
3. **The retention problem moves, it does not go away.** A report with a real session's URLs and
   error bodies now sits at a guessable URL for as long as the bucket keeps it, and snapit has no
   way to expire it.
4. **It is one line from being the service.** Once uploading exists, "just host it for people who
   have no bucket" is a small feature request and a large reversal.

How often is the wall actually hit? Measured on the captures in the save folder, a browser session
with a recording exports at 4 MB and a session without one at 1 MB. The 25 MB line is five or six
minutes of recording, and a bug report is rarely that. So the honest expectation is that the file
covers most of it, and M1.7 exists for the Jira description that takes no attachment at all.

Recommendation: do not build it until someone hits the wall. If they do, the cheapest version that
is not a reversal is a **user-supplied upload command** — a shell template in settings
(`aws s3 cp {file} s3://bucket/{name} && echo https://…/{name}`) that snapit runs and whose stdout
it treats as the link. snapit stores no credential, implements no protocol, and supports no bucket;
the user's own tooling does all four. It is also the version that works for the internal share and
the artifact store nobody has heard of.

Two costs that version carries and the table above does not. It puts an arbitrary shell command in
`settings.json` and runs it, which is a code-execution surface — self-inflicted, but a file anything
on the machine can write is now a file that runs things. And it fits badly with notarization: a
hardened runtime and a sandbox are exactly the things that make spawning the user's `aws` binary
awkward, and notarization is already the last item on this roadmap. Decide M1.7 after it, not
before.

### M1.8 — A home for reviewing

**Built (2026-09-03).** The library window became a home: the capture list on the left, the capture
itself beside it. Until now snapit had no surface of its own for the thing it exists to produce — you
made a capture in snapit and reviewed it in Chrome, so the moment the work got interesting you left.

**This is not the hosted version, and nothing here reverses M1.6 or M1.7.** No upload, no URL, no
account. The shape borrows from Jam and Loom; the hosting does not. The report is rendered from the
bundle on this machine and shown in a frame on a local scheme.

The decision worth knowing about is that the report is **framed**, not rebuilt in React. Rebuilding
would mean two renderers for one thing — the sortable Network table with its four detail tabs, the
console with its repeat collapsing, the seek script, the sticky player — kept in step by hand. What
framing gives up is that the app cannot put its own controls around the player, since the player is
inside the frame; what it buys is that the in-app view cannot drift from the file a Share sends,
because both come from the same `renderReport` call. `STATUS.md` has the full comparison, the
sandbox the frame runs under, and the two silent bugs that had to be fixed to make it work.

It also retired the report-staleness wart. `report.html` is still written once at capture time and
still never rewritten — a window that reads a capture must not mutate it — but nothing in the app
reads that file any more, and as of M1.10 a shared _folder_ re-renders too.

**Extended 2026-09-03 into the app shell it should have been.** The first pass built a two-pane
window and left the other four windows and the menu-bar navigation in place, which was the wrong
shape: snapit is one window now, with Overview, Captures, Analytics, Checks (listed, not built),
Claude Code, Settings and About as routes. The tray is actions only. First run and the image editor
are still windows, deliberately. `STATUS.md` has the reasoning and the measurements.

### M1.9 — Analytics across captures

**Built (2026-09-03).** The one question snapit can answer and DevTools cannot: DevTools has the
session that is open, snapit has all of them. So the page leads on **which endpoint failed in more
than one capture**, not on how many captures exist.

Local by construction — `analytics.ts` is pure and imports nothing that could reach the network.
The decision was to build the local insight and leave a clean seam for opt-in telemetry without
wiring any of it up; that seam is that a sender would be a separate module consuming this one's
output, with its own setting and its own visible log. Nothing in `Not in scope` moves.

Run against a real save folder it read 55 captures in 29 ms and surfaced a login endpoint failing
across four separate sessions, which no single report showed. The endpoint normalisation is what
makes that possible and is the part to be careful with — see `STATUS.md`.

### M1.10 — Sharing a complete package

**Built (2026-09-03).** M1.6's single file is right while it fits and stops fitting early: base64
costs a third of the recording, so a 33-minute capture is 153 MB on disk and 204 MB as one page.
Share now offers a `.zip` of the bundle as well, where the media is a file at its own size, and it
needed no change to the report because `report.html` already addresses its media by bare filename.

Still no upload, no link, no service. Both shapes are files the user sends by whatever means they
were going to use anyway, so M1.6's argument and M1.7's refusal both stand unchanged.

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

### M2.0 — The skeleton spec

**Built 2026-08-23 — and not the way this was planned.** The milestone assumed `playwright codegen`
was needed for the mechanical part, Playwright's selector generation. The M1.3 spike then found
`_enableRecorder` optional, and M1.3 built a trail that is _richer_ than codegen's: timestamped, with
ranked selector candidates and an ARIA snapshot per action. Shelling out to codegen would now buy
less than we already have, at the cost of an unsupported internal API. The skeleton is generated
from our own trail instead.

`specgen.ts` emits a runnable Playwright file into every session bundle as `generated.spec.ts`. It
picks the best locator each element supports — test id, then role and accessible name, then label,
text, id, and a CSS path only as a last resort because it breaks on any refactor. Redacted fills
become `process.env.TEST_SECRET` rather than a literal. Markers land between the steps they fell
between, converted onto the session clock. Verified by generating from a real live session, not
fixtures.

**It asserts nothing, deliberately.** Which of an action's changes is worth asserting, and what the
test should be called, are judgements the generator has no basis for. The file's header points
whoever opens it — human or agent — at `actions.json`'s `ariaAfter` snapshots, the HAR and the
markers, and says what each is for. `get_session_summary` returns its path so an agent can read it
directly, rather than spending a tool on it.

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
  unit, and as of M1.6 it is one file that opens anywhere. Sharing is not the thing being refused;
  operating a service is. Read M1.6 before reopening this.
- **Generating tests by reading the diff** — wrong end of the problem; it inherits the agent's own
  misreading of intent. snapit starts from an observed human demonstration.

## Not in scope

Cloud upload, shareable URLs, iOS capture, customer-facing recording links, network capture for
native applications (would need a TLS-intercepting proxy).

## Constraint carried forward

A native runtime port is still undecided, so keep collection at the protocol level. CDP over a
WebSocket is portable TypeScript; native input hooks are not. Nothing in M1.2–M1.3 should be built in
a way a port would have to throw away.
