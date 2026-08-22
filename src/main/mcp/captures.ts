import { isAbsolute, resolve, sep } from 'path'

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

/**
 * Resolve a bundle name to a directory inside the save folder.
 *
 * The name arrives from a model, so it is untrusted: `../../.ssh` must not resolve to
 * anything readable. Anything that escapes the save folder is refused rather than
 * clamped, because a silently rewritten path would read the wrong bundle and look like
 * it worked.
 */
export function resolveBundleDir(saveDir: string, given: string): string {
  const root = resolve(saveDir)
  const target = isAbsolute(given) ? resolve(given) : resolve(root, given)
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Bundle must be inside the snapit save folder. Refusing: ${given}`)
  }
  if (target === root) throw new Error('Expected a bundle name, not the save folder itself.')
  return target
}
