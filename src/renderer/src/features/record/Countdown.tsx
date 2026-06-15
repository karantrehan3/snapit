import type { ReactElement } from 'react'
import { countdownNumber, countdownRoot } from './styles'

/** Full-screen 3-2-1 countdown shown before recording begins. */
export function Countdown({ value }: { value: number }): ReactElement {
  return (
    <div style={countdownRoot}>
      {/* key re-triggers the pop animation on each tick */}
      <div key={value} style={countdownNumber}>
        {value}
      </div>
    </div>
  )
}
