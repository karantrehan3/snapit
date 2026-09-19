import type { CapturePayload } from './payload.ts'

/**
 * What an integration is, reduced to the smallest thing that is still useful.
 *
 * Two interfaces rather than one, because filing and announcing are different acts with
 * different failure modes: a Jira issue that fails to create must surface loudly (the bug
 * is not filed), and a Slack post that fails is an inconvenience. Collapsing them into a
 * generic `send()` would lose that distinction at exactly the moment it matters.
 *
 * Both take the same neutral `CapturePayload`, so neither adapter knows what a capture
 * is, and the payload builder knows nothing about ADF or Block Kit. Adding Linear or
 * GitHub Issues is then one file implementing `IssueTarget`.
 */

export type IssueRef = {
  /** `DEV-7641`. */
  key: string
  url: string
}

export type ChatRef = {
  /** Slack's message timestamp, or whatever the platform calls its message id. */
  id: string
  url: string | null
}

export interface IssueTarget {
  readonly kind: 'jira'
  /**
   * Render the payload without sending it.
   *
   * Separate from `create` on purpose: it is pure, it is what the tests assert on, and it
   * lets the desktop app show the reporter exactly what is about to be filed. An
   * integration whose output can only be seen by filing it is one nobody will trust.
   */
  preview(payload: CapturePayload, settings: Record<string, string>): unknown
  create(payload: CapturePayload, settings: Record<string, string>, secret: string): Promise<IssueRef>
}

export interface ChatTarget {
  readonly kind: 'slack'
  preview(payload: CapturePayload, settings: Record<string, string>, issue?: IssueRef): unknown
  post(
    payload: CapturePayload,
    settings: Record<string, string>,
    secret: string,
    issue?: IssueRef
  ): Promise<ChatRef>
}

export class IntegrationError extends Error {
  readonly kind: string
  readonly retryable: boolean

  constructor(kind: string, message: string, retryable = false) {
    super(message)
    this.name = 'IntegrationError'
    this.kind = kind
    this.retryable = retryable
  }
}
