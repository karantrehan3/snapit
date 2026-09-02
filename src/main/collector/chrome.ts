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
