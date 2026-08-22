/**
 * Credential stripping for collected network data.
 *
 * The bundle exists to be handed to someone else — a colleague, a ticket, an agent. A
 * HAR straight off a QA session carries session cookies and bearer tokens for whatever
 * the tester was logged into, which is very often a real account on a real environment.
 * Nothing here is written to disk before it has been through this.
 *
 * Pure, so the redaction rules are testable without a browser.
 */

export const REDACTED = '[redacted by snapit]'

/** Header names whose value is a credential. Matched case-insensitively. */
export const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-session-token',
  'x-access-token'
])

/** Query/form/JSON field names that carry a secret regardless of where they appear. */
const SENSITIVE_FIELDS = [
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'apikey',
  'api_key',
  'secret',
  'client_secret',
  'password',
  'passwd',
  'pwd',
  'signature',
  'sig',
  'auth',
  'session'
]

/** True for a field name that names a secret — substring, since prefixes vary wildly. */
export function isSensitiveField(name: string): boolean {
  const n = name.toLowerCase().replace(/[-\s]/g, '_')
  return SENSITIVE_FIELDS.some((f) => n === f || n.includes(f))
}

type NameValue = { name: string; value: string }

export function redactNameValues(pairs: readonly NameValue[] | undefined): NameValue[] {
  if (!Array.isArray(pairs)) return []
  return pairs.map((p) =>
    SENSITIVE_HEADERS.has(String(p.name).toLowerCase()) || isSensitiveField(String(p.name))
      ? { ...p, value: REDACTED }
      : p
  )
}

/** Cookies are credentials by definition here; only the names are kept. */
export function redactCookies(cookies: readonly NameValue[] | undefined): NameValue[] {
  if (!Array.isArray(cookies)) return []
  return cookies.map((c) => ({ ...c, value: REDACTED }))
}

/** Rewrite sensitive query parameters inside a URL, leaving the rest readable. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    let touched = false
    for (const key of [...parsed.searchParams.keys()]) {
      if (!isSensitiveField(key)) continue
      parsed.searchParams.set(key, REDACTED)
      touched = true
    }
    return touched ? parsed.toString() : url
  } catch {
    // Not a parseable URL (data:, blob:, malformed) — nothing to rewrite.
    return url
  }
}

/** Redact secrets by key name anywhere in a decoded JSON body, at any depth. */
export function redactJsonText(text: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return text
  }
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          isSensitiveField(k) ? REDACTED : walk(v)
        ])
      )
    }
    return value
  }
  return JSON.stringify(walk(parsed))
}

/**
 * Roles whose ARIA snapshot line carries what the user typed. Every other role's text
 * is rendered content — `- status: Order placed` — which is exactly the signal an
 * assertion is derived from and must survive.
 */
const VALUE_BEARING_ROLES = ['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider']

const ARIA_VALUE_LINE = new RegExp(`^(\\s*-\\s*(?:${VALUE_BEARING_ROLES.join('|')})\\b[^:]*:)\\s*(.+)$`)

/**
 * Strip typed values out of an ARIA snapshot.
 *
 * `locator.ariaSnapshot()` includes input values, so a snapshot taken after someone
 * types into a login form contains their password in plain text — through a completely
 * different door from the action trail, which redacts it properly. The values are not
 * worth keeping here anyway: what was typed is already recorded, with the right
 * redaction, on the action itself. A snapshot's job is to show what *changed as a
 * result*, and that is all structure and rendered text.
 */
export function redactAriaSnapshot(snapshot: string): string {
  return snapshot
    .split('\n')
    .map((line) => {
      const match = ARIA_VALUE_LINE.exec(line)
      return match ? `${match[1]} ${REDACTED}` : line
    })
    .join('\n')
}

type HarEntry = {
  request?: {
    url?: string
    headers?: NameValue[]
    cookies?: NameValue[]
    queryString?: NameValue[]
    postData?: { text?: string; params?: NameValue[] }
  }
  response?: {
    headers?: NameValue[]
    cookies?: NameValue[]
    content?: { text?: string; mimeType?: string }
  }
}

type Har = { log?: { entries?: HarEntry[] } }

const isJson = (mimeType: string | undefined): boolean =>
  typeof mimeType === 'string' && mimeType.includes('json')

/**
 * Strip credentials from a whole HAR: headers, cookies, query parameters, form fields
 * and JSON bodies. Bodies are otherwise left intact — a failed response body is usually
 * the reason the capture exists at all.
 */
export function redactHar<T extends Har>(har: T): T {
  const entries = har?.log?.entries
  if (!Array.isArray(entries)) return har
  const redacted = entries.map((entry) => {
    const req = entry.request
    const res = entry.response
    return {
      ...entry,
      ...(req && {
        request: {
          ...req,
          ...(req.url && { url: redactUrl(req.url) }),
          headers: redactNameValues(req.headers),
          cookies: redactCookies(req.cookies),
          queryString: redactNameValues(req.queryString),
          ...(req.postData && {
            postData: {
              ...req.postData,
              ...(req.postData.params && { params: redactNameValues(req.postData.params) }),
              ...(req.postData.text && { text: redactJsonText(req.postData.text) })
            }
          })
        }
      }),
      ...(res && {
        response: {
          ...res,
          headers: redactNameValues(res.headers),
          cookies: redactCookies(res.cookies),
          ...(res.content && {
            content: {
              ...res.content,
              ...(isJson(res.content.mimeType) && res.content.text
                ? { text: redactJsonText(res.content.text) }
                : {})
            }
          })
        }
      })
    }
  })
  return { ...har, log: { ...har.log, entries: redacted } }
}
