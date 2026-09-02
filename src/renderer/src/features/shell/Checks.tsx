import type { ReactElement } from 'react'
import { Icon } from '@renderer/components/Icon'
import { soonNote, soonTitle } from './styles'

/**
 * Listed in the nav so it is clear where Phase 2 goes, and honest about not being there.
 *
 * A nav that has to grow a section later is a nav that gets redesigned later, which is
 * most of why the shell has a sidebar at all. One dimmed row is the cheapest way to
 * commit to the shape now.
 */
export function Checks(): ReactElement {
  return (
    <div style={soonNote}>
      <Icon name="check" size={24} />
      <span style={soonTitle}>Checks are not built yet</span>
      <span>
        Every web session already writes a Playwright skeleton of what you did, as
        <code style={{ font: 'var(--t-small) var(--mono)' }}> generated.spec.ts</code>. Checks is where those
        become tests you can re-run, and where a broken selector gets repaired against the recording it came
        from.
      </span>
    </div>
  )
}
