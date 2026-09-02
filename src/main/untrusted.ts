/**
 * Reading values that came from somewhere else.
 *
 * Everything a bundle holds is foreign: console text is arbitrary output from another
 * application, a URL is whatever the page asked for, and a `network.har` read back off
 * disk may have been truncated by a crash or written by a version of snapit that did not
 * exist yet. So nothing is assumed to be the type it should be, and nothing is assumed
 * to be a length a page can hold.
 *
 * These were three private copies across `mcp/summarise.ts` and `reportRequests.ts`
 * before, which is two chances for the coercions to disagree about what an absent value
 * looks like.
 */

/** A string, or the fallback. `null`, a number and an object all become the fallback. */
export const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)

/** A finite number, or undefined. `NaN` and `Infinity` are not measurements. */
export const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** `abc...` — trailing dots rather than a Unicode ellipsis, which not every font has. */
export const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}...`
