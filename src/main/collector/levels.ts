/**
 * What the collector calls a console line, and which of those are worth surfacing.
 *
 * The names come from three different CDP events and do not agree with each other:
 * `Runtime.consoleAPICalled` reports `warning`, `Log.entryAdded` reports `warning` too,
 * but an exception routed through `Runtime.exceptionThrown` is stamped `uncaught` by
 * `collector/session.ts` because CDP gives it no level at all. Anything reading a
 * collected console has to know all three, and two places used to know them separately —
 * so a fourth level would have been added once and quietly ignored by the other reader.
 *
 * Pure, and deliberately tiny: this is a vocabulary, not a behaviour.
 */

const ERROR_LEVELS = new Set(['error', 'uncaught'])
const WARNING_LEVELS = new Set(['warning', 'warn'])

export const isErrorLevel = (level: string): boolean => ERROR_LEVELS.has(level)

export const isWarningLevel = (level: string): boolean => WARNING_LEVELS.has(level)

/** Worth a reader's attention. Everything else is the chatter a page makes anyway. */
export const isNotableLevel = (level: string): boolean => isErrorLevel(level) || isWarningLevel(level)
