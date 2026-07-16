import { extname } from 'path'

/**
 * Pure helpers for the "open & edit an existing image" flow.
 *
 * Kept free of electron imports so they can be unit-tested in isolation
 * (mirrors updateResolve.ts). The main process uses these to validate what
 * it opens (Finder "Open With", argv, or the tray dialog) and to turn the
 * editor's exported data URL back into bytes for saving.
 */

/** Still-image formats snapit can open and edit. */
export const EDITABLE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
export type EditableExt = (typeof EDITABLE_EXTENSIONS)[number]

const EXT_MIME: Record<EditableExt, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
}

/** Lowercased file extension without the leading dot ('' when there is none). */
export function normalizeExt(filePath: string): string {
  return extname(filePath).replace(/^\./, '').toLowerCase()
}

/** True when the path has an extension snapit can open for editing. */
export function isEditableImage(filePath: string): boolean {
  return (EDITABLE_EXTENSIONS as readonly string[]).includes(normalizeExt(filePath))
}

/** MIME type for an extension (dot optional, case-insensitive), or null if unsupported. */
export function mimeForExt(ext: string): string | null {
  const key = ext.replace(/^\./, '').toLowerCase()
  return (EXT_MIME as Record<string, string>)[key] ?? null
}

/** MIME type derived from a file path, or null if unsupported. */
export function mimeForPath(filePath: string): string | null {
  return mimeForExt(normalizeExt(filePath))
}

/**
 * Decode an image data URL (`data:image/<type>;base64,<data>`) to a Buffer.
 * Throws on anything that is not a base64 image data URL — callers must only
 * pass values that originate from the editor's own export.
 */
export function bufferFromDataUrl(dataUrl: string): Buffer {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]+=*)$/i.exec(dataUrl)
  if (!match) throw new Error('Not a base64 image data URL')
  return Buffer.from(match[2], 'base64')
}
