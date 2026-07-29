import { useEffect, useRef, type RefObject } from 'react'

/**
 * Mirror a value into a ref so long-lived callbacks can read it without going stale.
 *
 * Needed by the recorders: their rAF copy loops and `window` listeners are set up once
 * per recording, so anything they read from props directly would be frozen at the value
 * it had when the recording started.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}
