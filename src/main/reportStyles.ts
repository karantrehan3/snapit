/**
 * The report's stylesheet, as one string inlined into the page.
 *
 * Its own file because `report.ts` was 715 lines and 191 of them were this — a renderer
 * and a design system in one place, where every change to either meant reading past the
 * other. Nothing about the CSS is dynamic: it is inlined wholesale because the page has
 * to fetch nothing, and that is also why it cannot live in a `.css` file the bundler
 * would emit alongside.
 *
 * Two contexts share it, and they are why some of it looks over-careful: a report opens
 * in whatever browser the recipient has, in whichever colour scheme their system is set
 * to, and it must not fetch a font.
 */

export const REPORT_STYLES = `
  :root {
    --bg: #f5f6f8; --card: #ffffff; --edge: #e3e7ec; --rule: #eef1f5;
    --ink: #10151b; --ink-2: #5a6472; --ink-3: #8c95a3;
    --err: #c4342a; --err-soft: rgba(196, 52, 42, 0.08);
    --warn: #96650b; --warn-soft: rgba(150, 101, 11, 0.09);
    --focus: #c93a2c;
    --t-before: #cbd3dd; --t-wait: #8a6f9e; --t-recv: #98a4b3; --sel: #fbe3e0;
    --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0e1116; --card: #161a20; --edge: #262c34; --rule: #1e242b;
      --ink: #e9ecf1; --ink-2: #a3adba; --ink-3: #767f8c;
      --err: #ff6a5c; --err-soft: rgba(255, 106, 92, 0.11);
      --warn: #e3a53f; --warn-soft: rgba(227, 165, 63, 0.11);
      --focus: #f0574a;
      --t-before: #39424e; --t-wait: #9a7fae; --t-recv: #5f6b79; --sel: #2e1714;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1.75rem 1.25rem 5rem; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 78rem; margin: 0 auto; }
  a { color: inherit; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }

  header { margin-bottom: 1.25rem; }
  .kicker {
    display: flex; align-items: center; gap: .5rem; margin: 0 0 .35rem;
    font: 500 11px var(--mono); letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3);
  }
  .kicker .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--err); }
  h1 {
    margin: 0; font-size: clamp(1.35rem, 1.1rem + 1vw, 1.9rem); font-weight: 600;
    letter-spacing: -.02em; line-height: 1.15; overflow-wrap: anywhere;
  }
  .when { margin: .3rem 0 0; color: var(--ink-2); font-size: 13px; }

  .summary { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .9rem; }
  .summary a {
    display: inline-flex; align-items: baseline; gap: .35rem; text-decoration: none;
    padding: .3rem .65rem; border: 1px solid var(--edge); border-radius: 999px;
    background: var(--card); color: var(--ink-2); font-size: 12.5px;
  }
  .summary a b { font: 600 14px var(--mono); color: var(--ink); }
  .summary a.bad { border-color: var(--err); background: var(--err-soft); color: var(--err); }
  .summary a.bad b { color: var(--err); }
  .summary a:hover { border-color: var(--ink-3); }

  .split {
    display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 1.25rem; align-items: start;
  }
  .solo { display: grid; gap: 1.25rem; max-width: 52rem; }
  .media-col { position: sticky; top: 1rem; display: flex; flex-direction: column; gap: 1rem; }
  .timeline-col { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  /*
   * One column: the timeline runs underneath the media rather than beside it, so
   * sticking the whole column would float the markers and the environment table over
   * it. Only the player sticks — it is the one thing a timestamp needs on screen — and
   * it keeps a solid background because it now scrolls over the content below it.
   */
  @media (max-width: 62rem) {
    .split { grid-template-columns: minmax(0, 1fr); }
    .media-col { position: static; }
    .media-col figure { position: sticky; top: .5rem; z-index: 1; }
    .media-col video, .media-col img { max-height: 38vh; }
  }

  figure {
    margin: 0; background: #05070a; border: 1px solid var(--edge); border-radius: 12px;
    overflow: hidden; box-shadow: 0 1px 2px rgba(0, 0, 0, .05), 0 12px 28px -18px rgba(0, 0, 0, .5);
  }
  video, img { display: block; width: 100%; height: auto; max-height: 72vh; object-fit: contain; }

  /*
   * The marker rail, under the player.
   *
   * Inside the figure and flush against the video, so it reads as part of the player
   * rather than as a list that happens to be beneath one — the native controls sit
   * directly above it, which is as close to marks on the scrubber as a page can get
   * without owning the whole player.
   *
   * The pins are what the eye is meant to find, so the track is nearly nothing and they
   * are brand red. The playhead fill is quiet on purpose: the scrubber above already
   * says where playback is, and this only has to make the pins mean something as they
   * pass.
   */
  .rail {
    position: relative; height: 22px; cursor: pointer;
    background: #0b0e13; border-top: 1px solid var(--edge);
  }
  .rail::before {
    content: ''; position: absolute; left: 0; right: 0; top: 10px; height: 2px;
    background: rgba(255, 255, 255, .14);
  }
  .rail-fill {
    position: absolute; left: 0; top: 10px; height: 2px; width: 0;
    background: rgba(255, 255, 255, .38); pointer-events: none;
  }
  .pin {
    position: absolute; top: 3px; width: 12px; height: 16px; padding: 0;
    transform: translateX(-50%); border: none; background: none; cursor: pointer;
    -webkit-appearance: none; appearance: none;
  }
  .pin::before {
    content: ''; display: block; width: 3px; height: 16px; margin: 0 auto;
    border-radius: 2px; background: var(--focus);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, .45);
  }
  .pin:hover::before, .pin:focus-visible::before { width: 5px; }
  /* Passed, not current: playback has gone by it. Dimmer, so what is ahead stands out. */
  .pin.now::before { background: #fff; }
  .pin:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }

  .panel { background: var(--card); border: 1px solid var(--edge); border-radius: 12px; }
  details.env { overflow: hidden; }
  details.env > summary {
    cursor: pointer; padding: .7rem .9rem; list-style: none;
    font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2);
  }
  details.env > summary::-webkit-details-marker { display: none; }
  details.env > summary::after { content: ' \\25BE'; color: var(--ink-3); }
  details.env[open] > summary { border-bottom: 1px solid var(--rule); }
  details.env[open] > summary::after { content: ' \\25B4'; }
  table { border-collapse: collapse; width: 100%; }
  th, td {
    text-align: left; padding: .45rem .9rem; border-bottom: 1px solid var(--rule);
    vertical-align: top; font-size: 13px;
  }
  tr:last-child th, tr:last-child td { border-bottom: 0; }
  th { font-weight: 500; color: var(--ink-2); white-space: nowrap; width: 1%; }
  td { font-variant-numeric: tabular-nums; }

  .lines { padding: .85rem .9rem 1rem; scroll-margin-top: 1rem; }
  .lines h2 {
    margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .09em;
    text-transform: uppercase; color: var(--ink-3);
  }
  .lines ol {
    margin: .55rem 0 0; padding: 0; list-style: none;
    display: flex; flex-direction: column; gap: 1px;
  }
  .lines li {
    display: flex; align-items: baseline; gap: .55rem; padding: .32rem .45rem;
    border-radius: 6px; border-left: 2px solid transparent;
  }
  .lines li:hover { background: var(--rule); }
  .lines .more { color: var(--ink-3); font-size: 12px; }
  .text, .did { min-width: 0; overflow-wrap: anywhere; }
  .n {
    flex: none; min-width: 1.25rem; color: var(--ink-3);
    font: 500 11px var(--mono); font-variant-numeric: tabular-nums;
  }
  .at, .lvl, .times { font: 500 12px var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .at { flex: none; color: var(--ink-3); }
  .lvl { flex: none; color: var(--ink-3); text-transform: uppercase; font-size: 10.5px; letter-spacing: .04em; }
  .times { margin-left: auto; color: var(--ink-3); font-size: 11px; }


  /*
   * Network and Console, one panel with two tabs. Driven by :target so the counts in the
   * summary bar — already links to #requests and #console — switch tabs as well as
   * scroll, with no script and no second mechanism to keep in step.
   */
  .lower { margin-top: 1.25rem; }
  .lower-tabs { display: flex; gap: .25rem; margin-bottom: .6rem; }
  .lower-tabs a {
    display: inline-flex; align-items: baseline; gap: .4rem; text-decoration: none;
    padding: .35rem .8rem; border: 1px solid var(--edge); border-radius: 999px;
    background: var(--card); color: var(--ink-2); font-size: 13px;
  }
  .lower-tabs a b { font: 600 12px var(--mono); color: var(--ink-3); }
  .lower-tabs a:hover { border-color: var(--ink-3); color: var(--ink); }
  .lower > section { margin-top: 0; display: none; }
  .lower > section:target { display: block; }
  /* Nothing targeted yet is how the page opens: the first tab wins. */
  .lower:not(:has(> section:target)) > section:first-of-type { display: block; }
  .lower:not(:has(> section:target)) .lower-tabs a:first-child,
  .lower:has(#requests:target) .lower-tabs a[data-tab="requests"],
  .lower:has(#console:target) .lower-tabs a[data-tab="console"] {
    background: var(--focus); border-color: var(--focus); color: #fff;
  }
  .lower:not(:has(> section:target)) .lower-tabs a:first-child b,
  .lower:has(#requests:target) .lower-tabs a[data-tab="requests"] b,
  .lower:has(#console:target) .lower-tabs a[data-tab="console"] b { color: #fff; }

  /*
   * Header rows in the detail pane. These lost their styling when the inline request
   * list was replaced and rendered as a bare definition list — every value on its own
   * indented line, nothing telling a name from its value. The name column is fixed so
   * values line up down the page even when a name wraps, the name is quiet and the
   * value carries full contrast, and a rule separates each pair.
   */
  .kv {
    display: grid; grid-template-columns: minmax(6rem, 13rem) minmax(0, 1fr);
    align-items: start; margin: 0; border-top: 1px solid var(--rule);
  }
  .kv dt, .kv dd {
    padding: .3rem .55rem; border-bottom: 1px solid var(--rule);
    font: 11.5px var(--mono); overflow-wrap: anywhere; line-height: 1.45;
  }
  .kv dt { color: var(--ink-3); padding-left: 0; }
  .kv dd { margin: 0; color: var(--ink); padding-right: 0; }

  /*
   * The Network panel. Full width, below the two columns: eight columns and a waterfall
   * do not fit beside a video, and this is the one part of a report a reader works in
   * rather than scans. Everything below is prefixed net- so that none of it collides
   * with the timeline lists above it.
   */
  .netpanel { padding: 0; overflow: hidden; scroll-margin-top: 1rem; }
  .net-toolbar {
    display: flex; align-items: center; gap: .75rem; flex-wrap: wrap;
    padding: .55rem .75rem; border-bottom: 1px solid var(--rule);
  }
  .net-find {
    flex: 0 1 15rem; min-width: 8rem; padding: .3rem .55rem; font: 12.5px inherit;
    border: 1px solid var(--edge); border-radius: 6px; background: var(--bg); color: var(--ink);
  }
  .net-types { display: flex; gap: .2rem; flex-wrap: wrap; }
  .net-types button, .net-tabs button {
    padding: .22rem .55rem; border: 0; border-radius: 999px; background: transparent;
    color: var(--ink-2); font: 12px inherit; cursor: pointer;
  }
  .net-types button:hover, .net-tabs button:hover { background: var(--rule); }
  .net-types button.on { background: var(--focus); color: #fff; }
  .net-fails { display: inline-flex; align-items: center; gap: .35rem; color: var(--ink-2); font-size: 12px; }

  .net-split { display: grid; grid-template-columns: minmax(0, 1fr); }
  .net-split:has(.net-detail:not([hidden])) { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
  .net-list { max-height: 30rem; overflow: auto; }

  .net-table { width: 100%; font-size: 12.5px; }
  .net-table th, .net-table td {
    padding: .28rem .5rem; vertical-align: middle; white-space: nowrap; width: auto;
    font-size: 12.5px; border-bottom: 1px solid var(--rule);
  }
  .net-table thead th {
    position: sticky; top: 0; z-index: 1; background: var(--card); cursor: pointer;
    font: 600 10.5px var(--mono); letter-spacing: .06em; text-transform: uppercase;
    color: var(--ink-3); user-select: none;
  }
  .net-table thead th:hover { color: var(--ink); }
  .net-table thead th[data-dir="up"]::after { content: ' \\2191'; }
  .net-table thead th[data-dir="down"]::after { content: ' \\2193'; }
  .net-table tbody tr { cursor: pointer; }
  .net-table tbody tr:hover { background: var(--rule); }
  .net-table tbody tr.bad { background: var(--warn-soft); }
  .net-table tbody tr.bad .net-status { color: var(--warn); font-weight: 600; }
  .net-table tbody tr.worst { background: var(--err-soft); }
  .net-table tbody tr.worst .net-status { color: var(--err); }
  .net-table tbody tr.on, .net-table tbody tr.on:hover { background: var(--sel); }
  .net-at { width: 1%; }
  .net-name { max-width: 22rem; width: 30%; }
  .net-name .n { display: block; overflow: hidden; text-overflow: ellipsis; }
  .net-name .d { display: block; color: var(--ink-3); font-size: 11px; }
  .net-type, .net-init { color: var(--ink-3); }
  .net-status, .net-size, .net-time { font-variant-numeric: tabular-nums; }
  .net-size, .net-time { text-align: right; }
  .net-wf { position: relative; width: 30%; min-width: 11rem; }
  .net-wf-head { width: 30%; }
  .net-bar {
    position: absolute; top: 50%; transform: translateY(-50%); height: 8px; min-width: 2px;
    background: var(--t-wait); border-radius: 2px;
  }
  /* Over a minute-long capture a one-second request is a fraction of a percent. Chrome
     has the same arithmetic; what it does not have is a report you cannot zoom, so the
     bar keeps a floor and the Time column and Timing tab carry the magnitude. */
  .net-bar { min-width: 3px; }
  tr.bad .net-bar { background: var(--warn); }
  tr.worst .net-bar { background: var(--err); }

  .net-detail { display: flex; flex-direction: column; border-left: 1px solid var(--rule); max-height: 30rem; }
  /* display:flex outranks the user-agent rule for [hidden]; without this the tab strip
     sits at the foot of the panel with nothing selected. */
  .net-detail[hidden] { display: none; }
  .net-tabs {
    display: flex; gap: .1rem; align-items: center;
    padding: .35rem .5rem; border-bottom: 1px solid var(--rule);
  }
  .net-tabs button.on { background: var(--rule); color: var(--ink); font-weight: 600; }
  .net-close { margin-left: auto; color: var(--ink-3); font-size: 14px; }
  .net-panes { overflow: auto; padding: .65rem .8rem 1rem; }
  .net-pane h4 {
    margin: .9rem 0 .3rem; font: 600 10.5px var(--mono); letter-spacing: .07em;
    text-transform: uppercase; color: var(--ink-3);
  }
  .net-pane h4:first-child { margin-top: 0; }
  .net-note { margin: .5rem 0 0; color: var(--ink-3); font-size: 12px; }
  .net-body {
    margin: .3rem 0 0; padding: .5rem .6rem; border-radius: 6px; background: var(--rule);
    color: var(--ink-2); font: 11.5px var(--mono); white-space: pre-wrap;
    overflow-wrap: anywhere; max-height: 16rem; overflow: auto;
  }
  .net-timing { width: 100%; }
  .net-timing th, .net-timing td { border: 0; padding: .18rem 0; font-size: 11.5px; }
  .net-timing th { width: 1%; padding-right: .6rem; color: var(--ink-2); font-weight: 400; }
  .net-phase { width: 100%; }
  .net-phase-bar { display: block; height: 8px; min-width: 1px; border-radius: 2px; background: var(--t-before); }
  .phase-wait { background: var(--t-wait); }
  .phase-receive { background: var(--t-recv); }
  .net-phase-ms {
    text-align: right; white-space: nowrap; color: var(--ink-3);
    font: 11.5px var(--mono); font-variant-numeric: tabular-nums;
  }
  .net-total th, .net-total .net-phase-ms { color: var(--ink); font-weight: 600; }
  .net-foot {
    margin: 0; padding: .5rem .75rem; border-top: 1px solid var(--rule);
    color: var(--ink-3); font-size: 12px;
  }
  .net-foot code { font: 11.5px var(--mono); background: var(--rule); border-radius: 3px; padding: 0 .25rem; }

  /* Narrow: the detail pane goes under the table rather than beside it. */
  @media (max-width: 62rem) {
    .net-split:has(.net-detail:not([hidden])) { grid-template-columns: minmax(0, 1fr); }
    .net-detail { border-left: 0; border-top: 1px solid var(--rule); }
    .net-init, .net-type { display: none; }
  }

  /* A recording too large to inline. Saying so beats an element that plays nothing. */
  .absent { margin: 0; padding: .8rem .9rem; color: var(--ink-2); font-size: 13px; }
  .files a { color: var(--focus); text-decoration: none; font: 12.5px var(--mono); }
  .files a:hover { text-decoration: underline; }
  .files .facts { margin: .55rem 0 0; }
  .note { color: var(--ink); }

  /* Severity earns colour; everything else stays quiet so it can be scanned past. */
  .sev-error { background: var(--err-soft); border-left-color: var(--err); }
  .sev-error .lvl { color: var(--err); }
  .sev-error:hover { background: var(--err-soft); }
  .sev-warn { background: var(--warn-soft); border-left-color: var(--warn); }
  .sev-warn .lvl { color: var(--warn); }
  .sev-warn:hover { background: var(--warn-soft); }

  /* The line the playhead is on. */
  .lines li.now { background: var(--rule); border-left-color: var(--focus); }
  .lines li.now .at { color: var(--focus); }

  button.at {
    color: var(--ink-2); background: transparent; border: 1px solid var(--edge);
    border-radius: 5px; padding: .05rem .35rem; cursor: pointer; font-size: 11.5px;
  }
  button.at:hover { border-color: var(--focus); color: var(--focus); }

  .filter {
    display: inline-flex; align-items: center; gap: .4rem; margin-top: .4rem;
    color: var(--ink-2); font-size: 12px; cursor: pointer; user-select: none;
  }
  .filter em { color: var(--ink-3); font-style: normal; }
  /* CSS-only, so a report with no video still carries no script at all. Scoped to the
     section holding the checkbox, so the console and the network list filter apart. */
  .lines:has(.filter input:checked) li.sev-mute { display: none; }

  footer { margin-top: 1.5rem; color: var(--ink-3); font-size: 12px; max-width: 52rem; }
`
