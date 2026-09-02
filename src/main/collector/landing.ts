/**
 * The page snapit's own Chrome opens on.
 *
 * It exists to answer a question the browser otherwise cannot: which of these windows is
 * the one being collected. A fresh profile looks like any other Chrome, and reproducing a
 * bug in the wrong window produces an empty trail with nothing to explain it.
 *
 * It used to be a `data:text/html,` URL, on the reasoning that nothing would be written
 * to disk and nothing could go stale. What that actually did was put three kilobytes of
 * percent-encoded markup in the address bar of the window whose whole job is to look
 * trustworthy — the first thing anyone sees, and it reads like an attack. So it is a
 * template rendered to a file in snapit's own Chrome profile now, rewritten on every
 * launch, which keeps the "cannot go stale" part and gives the address bar a path.
 *
 * Pure and free of fs, like the rest of this directory: the caller writes it.
 */

/**
 * The window title, which is load-bearing twice over.
 *
 * `captureSession.ts` finds the window to record by matching it, and the Chrome profile
 * is named it so Chrome's own UI says the same thing. Two copies of a string that has to
 * agree is one copy too many, so it lives here.
 */
export const LANDING_TITLE = 'snapit — collecting'

/** File name inside the profile directory. What the address bar ends with. */
export const LANDING_FILE = 'snapit-collecting.html'

/**
 * What the page tells someone to do, in the order they will do it.
 *
 * Step 2 named the menu bar until the session bar existed. It is on screen, over the
 * browser, from the moment the window opens — telling someone to go looking through a
 * menu for a button already in front of them is worse than saying nothing.
 */
const STEPS = [
  'Get yourself ready here: sign in, navigate to the page you need.',
  'On the snapit bar at the top of your screen, choose <b>Start capture</b>. Everything up to ' +
    'that point is thrown away, so your sign-in never reaches the report.',
  'Reproduce the problem, then choose <b>Stop and save</b> on the same bar.'
] as const

/**
 * The page, as a string.
 *
 * Self-contained on purpose — no script, no stylesheet, no font, nothing fetched. The
 * collector records every request this browser makes, and the first entries in the HAR
 * should be the application under test, not snapit talking to itself.
 */
export function renderLanding(): string {
  return `<!doctype html>
<meta charset="utf-8" />
<title>${LANDING_TITLE}</title>
<style>
  :root {
    color-scheme: light dark;
  }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0f1216;
    color: #e9ecf1;
  }
  main {
    max-width: 34rem;
    padding: 2rem;
  }
  h1 {
    font-size: 1.25rem;
    margin: 0 0 0.25rem;
    letter-spacing: -0.01em;
  }
  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #ff5c4e;
    margin-right: 0.5rem;
  }
  p,
  ol {
    color: #a6b0bc;
  }
  p {
    margin: 0.75rem 0;
  }
  ol {
    padding-left: 1.1rem;
  }
  li {
    margin: 0.4rem 0;
  }
  b {
    color: #e9ecf1;
    font-weight: 600;
  }
</style>
<main>
  <h1><span class="dot"></span>This is snapit's browser</h1>
  <p>
    Everything you do in <b>this window</b> is being collected — console, network, and each click
    and form fill. Other Chrome windows are not.
  </p>
  <ol>
${STEPS.map((step) => `    <li>${step}</li>`).join('\n')}
  </ol>
</main>
`
}
