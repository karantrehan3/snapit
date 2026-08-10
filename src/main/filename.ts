import { join } from 'path'

/**
 * Pure filename helpers, kept free of electron imports so they can be unit-tested
 * in isolation (mirrors imageFile.ts / updateResolve.ts).
 */

/** `YYYY-MM-DD_HH-MM-SS` for the current moment, local time. */
export function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

/** A timestamped `snapit-<timestamp>.<ext>` path inside the given save folder. */
export function captureFilePath(saveDir: string, ext: string): string {
  return join(saveDir, `snapit-${timestamp()}.${ext}`)
}
