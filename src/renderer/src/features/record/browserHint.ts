/**
 * Noticing when someone is about to record a browser and lose the half of the story
 * that matters.
 *
 * A screen recording of a browser is pixels. The console, the network and the steps that
 * caused them are not in those pixels, and the only way to get them is a browser snapit
 * launched itself — a distinction nobody should have to discover by getting an empty
 * report.
 *
 * Detection is best-effort on purpose. Window titles on macOS are usually just the page
 * title, so "Google Chrome" often does not appear anywhere; on Windows and Linux it
 * usually does. The offer is therefore made either way, and detection only decides how
 * confidently it is worded. Getting this wrong must never hide the offer.
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

export type BrowserHint = { confident: boolean; text: string }

/**
 * The line shown under the record controls, or null when there is nothing useful to
 * say — a full-screen capture of a second display, say, is not about to be a browser.
 */
export function browserHint(source: { name: string; type: 'screen' | 'window' } | null): BrowserHint | null {
  if (!source) return null
  if (looksLikeBrowser(source.name)) {
    return {
      confident: true,
      text: 'That looks like a browser. This will record the picture only — snapit can also capture its console, network and steps, but only in a browser it opens.'
    }
  }
  if (source.type === 'window') {
    return {
      confident: false,
      text: 'Recording a web app? snapit can capture its console, network and steps too — in a browser it opens.'
    }
  }
  return null
}
