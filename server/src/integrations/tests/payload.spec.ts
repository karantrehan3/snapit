import { describe, expect, test } from 'vitest'
import { capturePayload, defaultSummary } from '../payload.ts'
import { jiraDescription, jiraIssueRequest } from '../jira.ts'
import { escapeMrkdwn, slackMessage } from '../slack.ts'
import { IntegrationError } from '../target.ts'
import { buildManifest } from '../../domain/manifest.ts'
import type { Capture } from '../../domain/model.ts'

const manifest = buildManifest({
  meta: {
    capturedAt: '2026-09-19T14:02:11.000Z',
    app: { version: '4.0.0' },
    system: { platform: 'darwin', release: '25.6.0', arch: 'arm64' },
    capture: { kind: 'browser-session', durationMs: 92_400, markers: [{ atMs: 1, note: 'x' }] },
    collected: { consoleErrors: 4, failedRequests: 2, actions: 17 }
  },
  artifacts: [{ name: 'report.html', role: 'report', bytes: 1, contentType: 'text/html' }],
  fallbackCapturedAt: '2026-09-19T00:00:00.000Z'
})

const capture: Capture = {
  id: 'cap-1',
  workspaceId: 'ws-1',
  orgId: 'org-1',
  shareSlug: 'abcdefghjkmnpqrstvwxyz0123',
  title: 'Checkout returns 500 after applying a coupon',
  status: 'ready',
  visibility: 'link',
  linkRevokedAt: null,
  uploadedBy: 'usr-1',
  createdAt: '2026-09-19T14:02:00.000Z',
  manifest
}

const reporter = { name: 'A tester', email: 'tester@example.com' }
const SHARE = 'https://snapit.example.com/capture/abcdefghjkmnpqrstvwxyz0123'

const detail = {
  steps: ['(0:04) Clicked "Apply coupon"', '(0:07) Clicked "Pay now"'],
  consoleErrors: ['TypeError: cannot read total of undefined'],
  failedRequests: ['POST 500 /api/v1/checkout — Internal Server Error']
}

const payload = capturePayload(capture, SHARE, reporter, detail)

describe('the neutral payload', () => {
  test('carries what a ticket and a chat message both need', () => {
    expect(payload.title).toBe(capture.title)
    expect(payload.environment).toBe('darwin 25.6.0 (arm64) · snapit 4.0.0')
    expect(payload.durationLabel).toBe('1:32')
    expect(payload.shareUrl).toBe(SHARE)
    expect(payload.counts).toEqual({ consoleErrors: 4, failedRequests: 2, actions: 17, markers: 1 })
  })

  test('leads the default summary with what failed, not with what exists', () => {
    expect(defaultSummary(manifest)).toBe(
      'snapit recorded 2 failed requests and 4 console errors across 17 recorded steps.'
    )
  })

  test('says something useful when nothing failed', () => {
    const clean = buildManifest({
      meta: { capture: { durationMs: 1000 } },
      artifacts: [],
      fallbackCapturedAt: 'x'
    })
    expect(defaultSummary(clean)).toContain('Nothing failed outright')
  })

  test('singularises counts of one', () => {
    const one = buildManifest({
      meta: { collected: { failedRequests: 1, consoleErrors: 0, actions: 1 } },
      artifacts: [],
      fallbackCapturedAt: 'x'
    })
    expect(defaultSummary(one)).toBe('snapit recorded 1 failed request across 1 recorded step.')
  })

  test('caps the lists so a ticket stays readable', () => {
    const many = capturePayload(capture, SHARE, reporter, {
      steps: Array.from({ length: 50 }, (_, i) => `step ${i}`),
      consoleErrors: Array.from({ length: 50 }, () => 'x'.repeat(900))
    })
    expect(many.steps).toHaveLength(20)
    expect(many.consoleErrors).toHaveLength(10)
    expect(many.consoleErrors[0]!.length).toBeLessThanOrEqual(300)
  })

  test('flattens multi-line text, so one field stays one field', () => {
    const wrapped = capturePayload(capture, SHARE, reporter, { steps: ['a\n\n  b\tc'] })
    expect(wrapped.steps[0]).toBe('a b c')
  })
})

describe('Jira', () => {
  test('opens with the link, because watching it is the fastest way to understand it', () => {
    const doc = jiraDescription(payload) as { content: Array<Record<string, any>> }
    const firstLink = doc.content[1]!.content[0]
    expect(firstLink.marks[0].attrs.href).toBe(SHARE)
  })

  test('builds a document with the sections a developer acts on, in order', () => {
    const doc = jiraDescription(payload) as { content: Array<Record<string, any>> }
    const headings = doc.content.filter((n) => n.type === 'heading').map((n) => n.content[0].text)
    expect(headings).toEqual(['Steps to reproduce', 'Environment', 'Failed requests', 'Console'])
  })

  test('omits sections it has nothing for, rather than printing empty ones', () => {
    const bare = capturePayload(capture, SHARE, reporter, {})
    const doc = jiraDescription(bare) as { content: Array<Record<string, any>> }
    const headings = doc.content.filter((n) => n.type === 'heading').map((n) => n.content[0].text)
    expect(headings).toEqual(['Environment'])
  })

  test('puts console output in a code block, which needs no escaping', () => {
    const doc = jiraDescription(payload) as { content: Array<Record<string, any>> }
    const block = doc.content.find((n) => n.type === 'codeBlock')!
    expect(block.content[0].text).toContain('TypeError')
  })

  test('produces a request the Jira REST API accepts in shape', () => {
    const request = jiraIssueRequest(payload, { projectKey: 'DEV', issueType: 'Bug' })
    expect(request.fields.project).toEqual({ key: 'DEV' })
    expect(request.fields.issuetype).toEqual({ name: 'Bug' })
    expect(request.fields.summary).toBe(capture.title)
    expect(request.fields.description.type).toBe('doc')
  })

  test('defaults the issue type but refuses to guess a project', () => {
    expect(jiraIssueRequest(payload, { projectKey: 'DEV' }).fields.issuetype).toEqual({ name: 'Bug' })
    expect(() => jiraIssueRequest(payload, {})).toThrow(IntegrationError)
  })

  test('truncates a summary Jira would reject', () => {
    const long = capturePayload({ ...capture, title: 'x'.repeat(400) }, SHARE, reporter)
    expect(jiraIssueRequest(long, { projectKey: 'DEV' }).fields.summary.length).toBeLessThanOrEqual(254)
  })
})

describe('Slack', () => {
  const message = slackMessage(payload)

  test('stands alone in a notification, without blocks', () => {
    expect(message.text).toContain(capture.title)
    expect(message.text).toContain(SHARE)
  })

  test('routes the bug with the failing endpoint, and links rather than attaches', () => {
    const json = JSON.stringify(message.blocks)
    expect(json).toContain('/api/v1/checkout')
    expect(json).toContain(SHARE)
    // A channel post is an interruption; the step list is one click away on purpose.
    expect(json).not.toContain('Apply coupon')
  })

  test('adds the Jira issue as a second button only when there is one', () => {
    const withIssue = slackMessage(payload, { key: 'DEV-7641', url: 'https://x/browse/DEV-7641' })
    const actions = withIssue.blocks.at(-1) as { elements: Array<Record<string, any>> }
    expect(actions.elements).toHaveLength(2)
    expect(actions.elements[1]!.text.text).toBe('DEV-7641')
    expect((message.blocks.at(-1) as { elements: unknown[] }).elements).toHaveLength(1)
  })

  test('keeps the header inside Slack’s 150-character limit', () => {
    const long = slackMessage(capturePayload({ ...capture, title: 'x'.repeat(400) }, SHARE, reporter))
    const header = long.blocks[0] as { text: { text: string } }
    expect(header.text.text.length).toBeLessThanOrEqual(150)
  })

  test('escapes only what Slack requires, leaving selectors intact', () => {
    expect(escapeMrkdwn('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
    // Escaping asterisks or underscores would corrupt `input_name` and `*.example.com`.
    expect(escapeMrkdwn('input_name *.example.com')).toBe('input_name *.example.com')
  })
})
