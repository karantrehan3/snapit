/**
 * Noticing when someone is about to record a browser and lose the half of the story
 * that matters.
 *
 * A screen recording of a browser is pixels. The console, the network and the steps that
 * caused them are not in those pixels, and the only way to get them is a browser snapit
 * launched itself — a distinction nobody should have to discover by getting an empty
 * report.
 *
 * This used to be a second bar floating under the command bar, offering to abandon the
 * recording and start a web capture. That offer now lives permanently in the bar's own
 * Screen/Web app selector, so a whole prompt for it was one idea asked twice. What is
 * left is the part the selector cannot do: pointing at it when the chosen window gives
 * the game away.
 *
 * Detection stays best-effort. A Chrome window on macOS is usually titled with the page
 * rather than the browser, so this often finds nothing — which is why it only ever adds
 * emphasis. The offer itself is always on screen regardless.
 */

const BROWSER_SIGNATURES = [
  'google chrome',
  'chromium',
  'microsoft edge',
  'safari',
  'firefox',
  'brave',
  'arc',
  'opera',
  'vivaldi'
]

export function looksLikeBrowser(sourceName: string): boolean {
  const name = sourceName.toLowerCase()
  return BROWSER_SIGNATURES.some((sig) => name.includes(sig))
}

/**
 * What to say on the Web app control when the selected source names a browser, or null
 * when there is nothing worth saying — which is most of the time, and is fine.
 */
export function webAppNudge(source: { name: string; type: 'screen' | 'window' } | null): string | null {
  if (!source || !looksLikeBrowser(source.name)) return null
  return 'That looks like a browser. Recording it captures the picture only — Web app also captures its console, network, steps and a test.'
}
