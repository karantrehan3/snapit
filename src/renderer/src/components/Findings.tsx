import type { CSSProperties, ReactElement } from 'react'

/**
 * What went wrong in a capture, as counts.
 *
 * The number is the thing the eye should land on, so it takes the report's red and the
 * monospace that makes a column of them comparable; the word after it stays quiet. These
 * were pills before — bordered, and as wide as their label, so a list of them could not
 * be read down.
 *
 * `compact` collapses the two counts into one total, for surfaces where the row is a
 * pointer to a capture rather than a description of it.
 */
export function Findings({
  consoleErrors,
  failedRequests,
  compact = false
}: {
  consoleErrors: number
  failedRequests: number
  /** One total instead of two labelled counts. */
  compact?: boolean
}): ReactElement | null {
  const total = consoleErrors + failedRequests
  if (total === 0) return null

  if (compact) {
    return (
      <span style={wrap}>
        <Count n={total} word={total === 1 ? 'finding' : 'findings'} />
      </span>
    )
  }
  return (
    <span style={wrap}>
      {consoleErrors > 0 && (
        <Count n={consoleErrors} word={`console error${consoleErrors === 1 ? '' : 's'}`} />
      )}
      {failedRequests > 0 && (
        <Count n={failedRequests} word={`failed request${failedRequests === 1 ? '' : 's'}`} />
      )}
    </span>
  )
}

function Count({ n, word }: { n: number; word: string }): ReactElement {
  return (
    <span style={item}>
      <span style={count}>{n}</span>
      {word}
    </span>
  )
}

const wrap: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12 }

const item: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 4,
  color: 'var(--ink-3)',
  font: 'var(--t-micro) var(--font)'
}

const count: CSSProperties = {
  color: 'var(--danger-ink)',
  font: '600 var(--t-small) var(--mono)',
  fontVariantNumeric: 'tabular-nums'
}
