import { mkdir, readdir, stat, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import { nativeImage, screen, type Display } from 'electron'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { captureDisplay } from '../capture'
import { captureFilePath } from '../filename'
import { getSettings } from '../settings'
import { toNativeCropRect } from './region'
import { previewSize } from './inlinePreview'

/**
 * MCP tool handlers for snapit's screenshot capabilities. Screenshots only —
 * recording is a separate, not-yet-built surface (it produces an artifact for
 * humans to watch, not something an LLM can usefully consume).
 *
 * `requestInteractiveCapture` is injected by the main process: it owns the
 * overlay window and capture-session state, this module only calls into it.
 */
export type CaptureHooks = {
  /** Opens the capture overlay and resolves with the annotated PNG data URL once
   *  the user finishes (copy/save/save-as), or rejects if busy/cancelled. */
  requestInteractiveCapture: () => Promise<string>
}

const includeImageParam = z
  .boolean()
  .optional()
  .describe(
    'Also return a downscaled inline preview (data URL, capped at 1400px wide) so you can look ' +
      'at the capture directly. Off by default — a full-resolution screenshot is several MB of ' +
      'base64 and consumes context fast.'
  )

function resolveDisplay(id: number | undefined): Display {
  if (id === undefined) return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const match = screen.getAllDisplays().find((d) => d.id === id)
  if (!match) throw new Error(`No display with id ${id}. Call list_displays to see the current ids.`)
  return match
}

async function saveCaptureDataUrl(dataUrl: string): Promise<{ path: string; width: number; height: number }> {
  const image = nativeImage.createFromDataURL(dataUrl)
  const { width, height } = image.getSize()
  const { saveDir } = getSettings()
  await mkdir(saveDir, { recursive: true })
  const path = captureFilePath(saveDir, 'png')
  await writeFile(path, image.toPNG())
  return { path, width, height }
}

function captureResult(
  path: string,
  width: number,
  height: number,
  dataUrl: string,
  includeImage: boolean | undefined
): CallToolResult {
  const content: CallToolResult['content'] = [
    { type: 'text', text: `Saved ${width}x${height} screenshot to ${path}` }
  ]
  if (includeImage) {
    const image = nativeImage.createFromDataURL(dataUrl)
    const full = image.getSize()
    const target = previewSize(full.width, full.height)
    const resized = target.width === full.width ? image : image.resize(target)
    content.push({ type: 'image', data: resized.toPNG().toString('base64'), mimeType: 'image/png' })
  }
  return { content }
}

export function registerCaptureTools(server: McpServer, hooks: CaptureHooks): void {
  server.registerTool(
    'list_displays',
    {
      title: 'List displays',
      description:
        "List the user's connected displays — the ids and bounds capture_screen / capture_region need.",
      inputSchema: {}
    },
    async () => {
      const primaryId = screen.getPrimaryDisplay().id
      const displays = screen.getAllDisplays().map((d) => ({
        id: d.id,
        label: d.label || `Display ${d.id}`,
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
        isPrimary: d.id === primaryId
      }))
      return { content: [{ type: 'text', text: JSON.stringify(displays, null, 2) }] }
    }
  )

  server.registerTool(
    'capture_screen',
    {
      title: 'Capture screen',
      description:
        'Silently capture a full screenshot of a display — no overlay, no user interaction. Saves a PNG ' +
        "to the user's snapit save folder and returns its path.",
      inputSchema: {
        display: z
          .number()
          .int()
          .optional()
          .describe('Display id from list_displays. Defaults to the display under the cursor.'),
        include_image: includeImageParam
      }
    },
    async ({ display, include_image }) => {
      const target = resolveDisplay(display)
      const dataUrl = await captureDisplay(target)
      const saved = await saveCaptureDataUrl(dataUrl)
      return captureResult(saved.path, saved.width, saved.height, dataUrl, include_image)
    }
  )

  server.registerTool(
    'capture_region',
    {
      title: 'Capture a region of a display',
      description:
        'Silently capture a rectangular region of a display — no overlay, no user interaction. Coordinates ' +
        "are in the display's own logical points (top-left of that display is 0,0), matching the bounds " +
        'list_displays reports. Saves a PNG and returns its path.',
      inputSchema: {
        x: z.number().describe('Left edge of the region, in the display’s logical points.'),
        y: z.number().describe('Top edge of the region, in the display’s logical points.'),
        width: z.number().positive(),
        height: z.number().positive(),
        display: z
          .number()
          .int()
          .optional()
          .describe('Display id from list_displays. Defaults to the display under the cursor.'),
        include_image: includeImageParam
      }
    },
    async ({ x, y, width, height, display, include_image }) => {
      const target = resolveDisplay(display)
      const dataUrl = await captureDisplay(target)
      const full = nativeImage.createFromDataURL(dataUrl)
      const rect = toNativeCropRect({ x, y, width, height }, target.scaleFactor, full.getSize())
      const croppedDataUrl = full.crop(rect).toDataURL()
      const saved = await saveCaptureDataUrl(croppedDataUrl)
      return captureResult(saved.path, saved.width, saved.height, croppedDataUrl, include_image)
    }
  )

  server.registerTool(
    'pick_region',
    {
      title: 'Ask the user to pick a region to capture',
      description:
        "Opens snapit's normal capture overlay so the user drags a selection, optionally annotates it, and " +
        'confirms. Use this when the target is easier for a human to point at than to describe (e.g. "capture ' +
        'whatever\'s wrong on screen"). Waits for the user; fails if they cancel or a capture is already running.',
      inputSchema: { include_image: includeImageParam }
    },
    async ({ include_image }) => {
      const dataUrl = await hooks.requestInteractiveCapture()
      const saved = await saveCaptureDataUrl(dataUrl)
      return captureResult(saved.path, saved.width, saved.height, dataUrl, include_image)
    }
  )

  server.registerTool(
    'recent_captures',
    {
      title: 'List recent captures',
      description:
        "List the most recent files in the user's snapit save folder (screenshots and recordings).",
      inputSchema: { limit: z.number().int().positive().max(100).optional().describe('Default 10, max 100.') }
    },
    async ({ limit }) => {
      const { saveDir } = getSettings()
      const entries = await listRecentCaptures(saveDir, limit ?? 10)
      return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] }
    }
  )
}

type CaptureEntry = { path: string; name: string; sizeBytes: number; modifiedAt: string }

// The only extensions snapit itself ever writes into saveDir (screenshots, video, gif) —
// filters out unrelated files a user may keep in the same folder, e.g. macOS's .DS_Store.
const CAPTURE_EXTENSIONS = ['.png', '.mp4', '.webm', '.gif']

async function listRecentCaptures(saveDir: string, limit: number): Promise<CaptureEntry[]> {
  let names: string[]
  try {
    names = await readdir(saveDir)
  } catch {
    return []
  }
  const candidates = names.filter((name) => CAPTURE_EXTENSIONS.includes(extname(name).toLowerCase()))
  const stats = await Promise.all(
    candidates.map(async (name) => {
      const path = join(saveDir, name)
      const info = await stat(path)
      return { path, name, sizeBytes: info.size, mtimeMs: info.mtimeMs, isFile: info.isFile() }
    })
  )
  return stats
    .filter((entry) => entry.isFile)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map(({ path, name, sizeBytes, mtimeMs }) => ({
      path,
      name,
      sizeBytes,
      modifiedAt: new Date(mtimeMs).toISOString()
    }))
}
