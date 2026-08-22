/**
 * Pure helpers for listing captures, kept free of electron and fs imports so they
 * can be unit-tested in isolation (mirrors region.ts / inlinePreview.ts).
 */

/** The only extensions snapit itself writes — screenshots, video, gif. */
export const CAPTURE_EXTENSIONS = ['.png', '.mp4', '.webm', '.gif']

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export const isCaptureFile = (name: string): boolean => CAPTURE_EXTENSIONS.includes(extensionOf(name))

/**
 * Pick the media file inside a bundle directory.
 *
 * Prefers what meta.json names, but falls back to scanning the directory: a bundle
 * whose media was written and whose metadata then failed still holds the recording,
 * and refusing to list it would hide a capture the user actually has. Sorted so the
 * fallback is deterministic when a folder somehow holds more than one.
 */
export function pickBundleMedia(names: string[], metaMediaFile: string | null): string | null {
  if (metaMediaFile && names.includes(metaMediaFile) && isCaptureFile(metaMediaFile)) return metaMediaFile
  const candidates = names.filter(isCaptureFile).sort()
  return candidates[0] ?? null
}
