/**
 * Pointing a bundle's `report.html` at media that is no longer beside it.
 *
 * This is the one place where the server has to know something about the file the
 * desktop produced, and it is worth being explicit about why. Inside a bundle the report
 * addresses its media by **bare filename** — `<video src="snapit-2026-09-19.mp4">` —
 * because that is what makes a folder, a zip and the app's own framed view all work from
 * one `renderReport` call. Serve that same page from a URL and the bare name resolves
 * against *that* URL, which is not where the recording is.
 *
 * Three ways out, and the reason for the one taken:
 *
 * - **Proxy the media through the server.** Correct, and it puts 560 MB of someone's QA
 *   recording through the metadata service on every play. That is the thing the whole
 *   presigned-upload design exists to avoid, so not this.
 * - **Re-render the report server-side** with `ReportOptions.mediaSrc`, which the app
 *   already supports. Cleanest by far — and it requires the server to import the app's
 *   renderer, which means shipping them in lockstep. Worth doing if this prototype
 *   becomes real; see the README.
 * - **Substitute the one attribute.** What this does. One known token, replaced once,
 *   and it reports whether it matched so the caller can fall back rather than serve a
 *   silently broken player.
 *
 * Pure, and tested against the exact markup `src/main/report.ts` emits.
 */

/** Mirrors `escapeHtml` in the app's `report.ts` — the report escapes the name before writing it. */
function escapeHtml(value: string): string {
  const escapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }
  return value.replace(/[&<>"']/g, (c) => escapes[c]!)
}

export type Rewrite = {
  html: string
  /** False when the expected attribute was not found — the caller must not serve this. */
  rewritten: boolean
}

/**
 * Replace the media element's `src` with `url`.
 *
 * Anchored to `src="<name>"` immediately inside a `<video`/`<img` tag rather than a bare
 * string replace: the filename also appears in the report's prose and in its attachment
 * list, and rewriting those would turn a readable name into a signed URL.
 */
export function rewriteMediaSrc(html: string, mediaName: string, url: string): Rewrite {
  const escapedName = escapeHtml(mediaName)
  const pattern = new RegExp(
    `(<(?:video|img)\\b[^>]*?\\bsrc=")${escapeRegExp(escapedName)}(")`,
    // One media element per report; `i` because nothing guarantees the tag's case forever.
    'i'
  )
  if (!pattern.test(html)) return { html, rewritten: false }
  // The URL is going into a quoted attribute and carries `&` between query parameters.
  return { html: html.replace(pattern, `$1${escapeHtml(url)}$2`), rewritten: true }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A `<base>` so that anything else the report addresses relatively resolves next to it.
 *
 * Belt and braces for the files a future report might reference. It goes immediately
 * after `<head>` so it precedes every relative URL in the document, which is the only
 * position where `<base>` means anything.
 */
export function withBase(html: string, baseHref: string): string {
  return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}<base href="${escapeHtml(baseHref)}">`)
}
