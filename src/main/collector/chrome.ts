/**
 * Finding and launching the browser the collector attaches to.
 *
 * Pure, free of electron and fs imports so the argument list — which is security
 * relevant — can be asserted in tests.
 */

/** Where a Chromium-family browser usually lives, best match first. */
export function chromeCandidates(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = {}
): string[] {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ]
  }
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(
      (r): r is string => typeof r === 'string' && r.length > 0
    )
    return roots.flatMap((root) => [
      `${root}\\Google\\Chrome\\Application\\chrome.exe`,
      `${root}\\Microsoft\\Edge\\Application\\msedge.exe`
    ])
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ]
}

/**
 * The page snapit's own Chrome opens on.
 *
 * It exists to answer a question the browser otherwise cannot: which of these windows is
 * the one being collected. A fresh profile looks like any other Chrome, and reproducing a
 * bug in the wrong window produces an empty trail with nothing to explain it.
 *
 * A data URL rather than a file, so nothing is written to disk and nothing can go stale.
 */
export const LANDING_PAGE =
  'data:text/html,' +
  encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><title>snapit — collecting</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
         background:#0f1216; color:#e9ecf1 }
  main { max-width:34rem; padding:2rem }
  h1 { font-size:1.25rem; margin:0 0 .25rem; letter-spacing:-.01em }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; background:#ff5c4e; margin-right:.5rem }
  p { color:#a6b0bc; margin:.75rem 0 }
  ol { color:#a6b0bc; padding-left:1.1rem }
  li { margin:.4rem 0 }
  b { color:#e9ecf1; font-weight:600 }
</style>
<main>
  <h1><span class="dot"></span>This is snapit's browser</h1>
  <p>Everything you do in <b>this window</b> is being collected — console, network,
     and each click and form fill. Other Chrome windows are not.</p>
  <ol>
    <li>Get yourself ready here: sign in, navigate to the page you need.</li>
    <li>From the snapit menu bar icon, choose <b>Start capture</b>. Everything up to that
        point is thrown away, so your sign-in never reaches the report.</li>
    <li>Reproduce the problem, then choose <b>Stop and save</b>.</li>
  </ol>
</main>`
  )

export type LaunchOptions = {
  port: number
  /** Persisted between sessions, so a tester logs in to the app under test once. */
  profileDir: string
  startUrl?: string
}

export function launchArgs({ port, profileDir, startUrl }: LaunchOptions): string[] {
  const args = [
    `--remote-debugging-port=${port}`,
    // An open debugging port is complete control of the browser — every cookie, every
    // page, arbitrary script. Bind it to loopback explicitly rather than trusting the
    // default, the same reasoning the MCP server is held to.
    '--remote-debugging-address=127.0.0.1',
    // Chrome refuses remote debugging on the default profile, so this is required, not
    // a nicety. Persisting our own means logins survive between sessions.
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check'
  ]
  if (startUrl) args.push(startUrl)
  return args
}

/** The CDP endpoint for a launched browser. Loopback, to match how it was launched. */
export const cdpEndpoint = (port: number): string => `http://127.0.0.1:${port}`
