import { IntegrationError, type IssueRef, type IssueTarget } from './target.ts'
import type { CapturePayload } from './payload.ts'

/**
 * Jira. The document builder is complete and tested; the REST call is one function.
 *
 * That split is the brief's instruction ("prototype the architecture and API boundary
 * first") and it is also where the actual work is. Creating an issue is one authenticated
 * POST. Producing a description a developer can act on — steps, environment, the failing
 * requests, and a link back — is the part that decides whether the integration is used
 * twice, and it is pure, so it can be got right without a Jira instance.
 *
 * ADF rather than wiki markup because `/rest/api/3/issue` takes ADF and the plain-text
 * fallback renders badly in the issue view. The node vocabulary used here is deliberately
 * small — heading, paragraph, bulletList, codeBlock, link — since those are the nodes
 * every Jira deployment renders the same way.
 */

type Adf = {
  type: string
  content?: Adf[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: unknown[]
}

const text = (value: string): Adf => ({ type: 'text', text: value })

const link = (value: string, href: string): Adf => ({
  type: 'text',
  text: value,
  marks: [{ type: 'link', attrs: { href } }]
})

const paragraph = (...content: Adf[]): Adf => ({ type: 'paragraph', content })

const heading = (value: string, level = 3): Adf => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)]
})

const bulletList = (items: readonly string[]): Adf => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(text(item))] }))
})

const orderedList = (items: readonly string[]): Adf => ({
  type: 'orderedList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(text(item))] }))
})

/**
 * Console output goes in a code block for the same reason `markdown.ts` fences it: it is
 * arbitrary text from somebody else's application, and a code block is the one container
 * that needs no escaping.
 */
const codeBlock = (lines: readonly string[]): Adf => ({
  type: 'codeBlock',
  attrs: { language: 'text' },
  content: [text(lines.join('\n'))]
})

export type JiraIssueRequest = {
  fields: {
    project: { key: string }
    issuetype: { name: string }
    summary: string
    description: Adf
  }
}

/**
 * The issue document.
 *
 * Order is the argument: the link first, because the fastest way to understand the bug is
 * to watch it; then how to reproduce; then the evidence. A description that opens with an
 * environment table is one a developer scrolls past.
 */
export function jiraDescription(payload: CapturePayload): Adf {
  const content: Adf[] = [
    paragraph(text(payload.summary)),
    paragraph(link('▶ Watch the capture in snapit', payload.shareUrl))
  ]

  if (payload.steps.length > 0) {
    content.push(heading('Steps to reproduce'), orderedList(payload.steps))
  }

  content.push(
    heading('Environment'),
    bulletList([
      payload.environment,
      `Captured ${new Date(payload.capturedAt).toUTCString()} · ${payload.durationLabel}`,
      `Reported by ${payload.reporter.name} (${payload.reporter.email})`
    ])
  )

  if (payload.failedRequests.length > 0) {
    content.push(heading('Failed requests'), bulletList(payload.failedRequests))
  }
  if (payload.consoleErrors.length > 0) {
    content.push(heading('Console'), codeBlock(payload.consoleErrors))
  }

  content.push(
    paragraph(text('Filed from snapit. The recording, HAR, console and action trail are at the link above.'))
  )

  return { type: 'doc', version: 1, content } as Adf
}

export function jiraIssueRequest(
  payload: CapturePayload,
  settings: Record<string, string>
): JiraIssueRequest {
  const projectKey = settings.projectKey
  if (!projectKey) throw new IntegrationError('jira', 'This workspace has no Jira project key configured.')
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { name: settings.issueType || 'Bug' },
      summary: payload.title.slice(0, 254),
      description: jiraDescription(payload)
    }
  }
}

/**
 * The boundary, and the whole of it.
 *
 * `secret` is an API token paired with `settings.email` — Basic auth, which is what Atlassian
 * Cloud takes. It is a parameter rather than a field because the store deliberately does
 * not persist it (see `store/memory.ts`): a prototype that writes a Jira token to a JSON
 * file is a prototype that leaves one behind.
 *
 * Not built here, and named so nobody assumes otherwise: OAuth 2.0 (3LO) instead of a
 * token, retry on 429 with `Retry-After`, and attaching the capture's media to the issue.
 * The first is what a real deployment needs; the last is probably a mistake, since it
 * duplicates the bytes the share link already serves.
 */
export const jiraTarget: IssueTarget = {
  kind: 'jira',

  preview: (payload, settings) => jiraIssueRequest(payload, settings),

  async create(payload, settings, secret) {
    const site = settings.site
    const email = settings.email
    if (!site || !email) {
      throw new IntegrationError('jira', 'This workspace needs a Jira site and account email configured.')
    }
    const body = jiraIssueRequest(payload, settings)
    const auth = Buffer.from(`${email}:${secret}`).toString('base64')

    let res: Response
    try {
      res = await fetch(`https://${site}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(body)
      })
    } catch {
      throw new IntegrationError('jira', `Could not reach ${site}.`, true)
    }

    if (!res.ok) {
      // Jira's errors are specific and useful — a missing required field names the field.
      // They are surfaced, because the alternative is an admin guessing at a screen config.
      const detail = await res.text().catch(() => '')
      throw new IntegrationError(
        'jira',
        `Jira refused the issue (${res.status}): ${detail.slice(0, 500) || res.statusText}`,
        res.status === 429 || res.status >= 500
      )
    }

    const created = (await res.json()) as { key?: string }
    if (!created.key) throw new IntegrationError('jira', 'Jira accepted the issue but returned no key.')
    return { key: created.key, url: `https://${site}/browse/${created.key}` }
  }
}
