import { IntegrationError, type ChatRef, type ChatTarget, type IssueRef } from './target.ts'
import type { CapturePayload } from './payload.ts'

/**
 * Slack. Block Kit builder complete and tested; the send is one POST.
 *
 * The design decision worth defending is what is *left out*. A capture has a recording,
 * a HAR, a console, an action trail and four counts, and all of it fits in a Slack
 * message if you try. None of it should be there. A channel post is an interruption, and
 * the job of the interruption is to let everyone reading decide in two seconds whether
 * it is theirs — so it carries the title, what failed, who found it, where, and a link.
 * The detail is one click away and one click is the correct price.
 *
 * Hence: no attachments, no HAR excerpt, no step list. The failing requests get a
 * context line because "which endpoint" is the single field that routes a bug to the
 * right person without anyone opening it.
 */

type Block = Record<string, unknown>

const section = (markdown: string): Block => ({
  type: 'section',
  text: { type: 'mrkdwn', text: markdown }
})

/**
 * Slack's mrkdwn is not Markdown: `&`, `<` and `>` are the only characters that must be
 * escaped, and escaping more (asterisks, underscores) corrupts text that legitimately
 * contains them — a selector like `input_name` being the obvious case.
 */
export function escapeMrkdwn(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const clip = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`

export type SlackMessage = { text: string; blocks: Block[] }

export function slackMessage(payload: CapturePayload, issue?: IssueRef): SlackMessage {
  const { counts } = payload
  const findings = [
    counts.failedRequests > 0 ? `:red_circle: ${counts.failedRequests} failed` : '',
    counts.consoleErrors > 0 ? `:warning: ${counts.consoleErrors} console` : '',
    counts.actions > 0 ? `${counts.actions} steps` : ''
  ].filter(Boolean)

  const blocks: Block[] = [
    {
      type: 'header',
      // A header block takes plain text only, and truncates hard at 150.
      text: { type: 'plain_text', text: clip(payload.title, 150), emoji: true }
    },
    section(escapeMrkdwn(payload.summary))
  ]

  if (payload.failedRequests.length > 0) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: payload.failedRequests
            .slice(0, 3)
            .map((r) => `\`${escapeMrkdwn(clip(r, 120))}\``)
            .join('  ·  ')
        }
      ]
    })
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: [
          `*${escapeMrkdwn(payload.reporter.name)}*`,
          escapeMrkdwn(payload.environment),
          escapeMrkdwn(payload.durationLabel),
          ...findings
        ].join('  ·  ')
      }
    ]
  })

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Watch capture', emoji: true },
        url: payload.shareUrl,
        style: 'primary'
      },
      ...(issue
        ? [
            {
              type: 'button',
              text: { type: 'plain_text', text: issue.key, emoji: false },
              url: issue.url
            }
          ]
        : [])
    ]
  })

  return {
    // The notification text, for the sidebar and for anyone with blocks disabled. It has
    // to stand alone, which is why it repeats the title rather than saying "New capture".
    text: `${payload.title} — ${payload.summary} ${payload.shareUrl}`,
    blocks
  }
}

/**
 * The boundary.
 *
 * An incoming webhook, not a bot token: it is the smallest thing that works, it needs no
 * OAuth install, and its one capability is posting to the one channel it was created
 * for — which is the right blast radius for a prototype holding a URL that plays
 * somebody's QA session. The cost is that a webhook cannot thread, cannot update a
 * message, and returns no message id, so `ChatRef.id` is synthetic here. A real build
 * uses `chat.postMessage` with a bot token and gets a `ts` back, which is what makes
 * "the capture was updated" a thread reply rather than a second interruption.
 */
export const slackTarget: ChatTarget = {
  kind: 'slack',

  preview: (payload, _settings, issue) => slackMessage(payload, issue),

  async post(payload, settings, secret, issue) {
    if (!secret) throw new IntegrationError('slack', 'This workspace has no Slack webhook configured.')
    const message = slackMessage(payload, issue)

    let res: Response
    try {
      res = await fetch(secret, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...message, ...(settings.channel ? { channel: settings.channel } : {}) })
      })
    } catch {
      throw new IntegrationError('slack', 'Could not reach Slack.', true)
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new IntegrationError(
        'slack',
        `Slack refused the message (${res.status}): ${detail.slice(0, 200) || res.statusText}`,
        res.status === 429 || res.status >= 500
      )
    }
    return { id: `webhook-${Date.now()}`, url: null }
  }
}
