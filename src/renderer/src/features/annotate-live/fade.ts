import { FADE_MS, SHAPE_TTL_MS } from './types'

/**
 * Opacity for a live annotation: fully opaque until its TTL, then a linear fade to
 * zero. Kept pure (plain numbers, no canvas) so the timing curve is unit-testable.
 */
export function opacityAt(bornAt: number, now: number, ttl = SHAPE_TTL_MS, fade = FADE_MS): number {
  const age = now - bornAt
  if (age <= ttl) return 1
  if (fade <= 0 || age >= ttl + fade) return 0
  return 1 - (age - ttl) / fade
}

/**
 * Drop shapes that have fully faded. Returns the *original* array when nothing
 * expired — this runs on a timer, and handing back a fresh array every tick would
 * re-render the Konva stage for no reason.
 */
export function pruneExpired<T extends { bornAt: number }>(
  shapes: T[],
  now: number,
  ttl = SHAPE_TTL_MS,
  fade = FADE_MS
): T[] {
  const kept = shapes.filter((s) => opacityAt(s.bornAt, now, ttl, fade) > 0)
  return kept.length === shapes.length ? shapes : kept
}
