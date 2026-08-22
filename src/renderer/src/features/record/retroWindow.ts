import { KEEP_EVERYTHING, type RetroWindow } from './retroBuffer'

/**
 * How much of a recording to keep. "Everything" is the default and the behaviour
 * snapit has always had; the bounded options exist because a bug is usually noticed
 * after it happens, and the twenty minutes before it are not the evidence.
 */
export type RetroChoice = { value: RetroWindow; label: string; hint: string }

export const RETRO_CHOICES: readonly RetroChoice[] = [
  { value: KEEP_EVERYTHING, label: 'Everything', hint: 'Keep the whole recording, however long it runs.' },
  { value: 30, label: 'Last 30s', hint: 'Leave it running; only the last 30 seconds are saved.' },
  { value: 60, label: 'Last 60s', hint: 'Leave it running; only the last minute is saved.' },
  { value: 180, label: 'Last 3m', hint: 'Enough for a long flow, without the setup before it.' }
]

export const DEFAULT_RETRO: RetroWindow = KEEP_EVERYTHING

export const retroLabel = (value: RetroWindow): string =>
  RETRO_CHOICES.find((c) => c.value === value)?.label ?? 'Everything'
