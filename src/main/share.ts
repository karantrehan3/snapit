import { basename, join } from 'path'
import { BrowserWindow, Notification, dialog, shell } from 'electron'
import { humanBytes } from './bundle'
import { assertInside } from './library'
import { preparePackage, writePackage } from './packageFile'
import { shareTargetName, shareVerdict, suggestedShape, type ShareShape } from './standalone'
import { prepareStandalone, writeStandalone } from './standaloneFile'

/**
 * Sharing a capture with someone who does not have the folder.
 *
 * Two shapes, because one was never enough. A single `.html` asks nothing of the
 * recipient — double-click and it plays — and it is the right answer while it fits. It
 * stops fitting early: base64 costs a third of the recording, the recording is nearly
 * all of the file, and a 33-minute capture that is 153 MB on disk becomes 204 MB as one
 * page. Nothing accepts that. So there is also a `.zip` of the bundle, where the media
 * is a file at its own size.
 *
 * Both stay inside the line `ROADMAP.md` draws: nothing is uploaded, no link is minted
 * and no service is operated. The file is the user's to send by whatever means they were
 * going to use anyway. See M1.6 for the argument and M1.7 for what a link would cost.
 *
 * The dialogs live here so the IPC handler is one line and the reading and writing stay
 * in `standaloneFile.ts` and `packageFile.ts`, which can then be run outside electron.
 */

type Chosen = { shape: ShareShape } | null

/**
 * Ask which shape, rather than picking silently.
 *
 * Which of "too big to send" and "the recipient has to unzip it" is worse depends
 * entirely on where it is going, and only the sender knows that. Under the attachment
 * limit there is nothing to weigh — the single file wins on every axis — so nothing is
 * asked.
 */
async function chooseShape(
  parent: BrowserWindow | null,
  fileBytes: number,
  packageBytes: number,
  withoutMediaBytes: number,
  hasMedia: boolean
): Promise<Chosen> {
  const suggested = suggestedShape(fileBytes)
  if (!hasMedia || suggested === 'file') return { shape: 'file' }

  const verdict = shareVerdict(fileBytes)
  const tooLarge = verdict === 'too-large'

  // The package leads, because past the attachment limit it is the only shape that still
  // carries the recording at all.
  const buttons = [
    `Package (${humanBytes(packageBytes)})`,
    ...(tooLarge ? [] : [`One file (${humanBytes(fileBytes)})`]),
    `Report only (${humanBytes(withoutMediaBytes)})`,
    'Cancel'
  ]
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    message: tooLarge
      ? 'This recording is too large to put inside a single file'
      : `As one file this capture is ${humanBytes(fileBytes)}`,
    detail: tooLarge
      ? 'Past about half a gigabyte a browser stops opening the page at all. A package is a ' +
        'zip of the whole capture — the recording stays a file at its own size, and the report ' +
        'inside opens by double-click once it is unzipped.'
      : 'Base64 adds a third to the recording, and most mail and ticket systems stop at 25 MB. ' +
        'A package is a zip of the whole capture, so the recording stays its own size; one file ' +
        'needs no unzipping. Report only drops the recording and keeps everything else.'
  }
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)

  const order: ShareShape[] = tooLarge ? ['package', 'report-only'] : ['package', 'file', 'report-only']
  return response < order.length ? { shape: order[response] } : null
}

/** What each shape is called, so the notification and the dialog agree. */
const SHAPE_NOTE: Record<ShareShape, string> = {
  file: 'opens in any browser',
  package: 'unzip, then open report.html',
  'report-only': 'the recording stayed here'
}

/**
 * Library → Share. Resolves to the written path, or null when the user backed out.
 *
 * The bundle path comes from the renderer, so it goes through `assertInside` like every
 * other path the library hands back.
 */
export async function shareCapture(
  saveDir: string,
  bundlePath: string,
  parent: BrowserWindow | null
): Promise<string | null> {
  try {
    const dir = assertInside(saveDir, bundlePath)

    // All three sizes before anything is offered, because the numbers are the decision.
    const withMedia = await prepareStandalone(dir, true)
    const hasMedia = withMedia.mediaPath !== null
    const without = hasMedia ? await prepareStandalone(dir, false) : withMedia
    const pkg = hasMedia ? await preparePackage(dir) : null

    const chosen = await chooseShape(
      parent,
      withMedia.totalBytes,
      pkg?.estimatedBytes ?? 0,
      without.totalBytes,
      hasMedia
    )
    if (!chosen) return null

    const isPackage = chosen.shape === 'package'
    const options: Electron.SaveDialogOptions = {
      title: isPackage ? 'Share capture as a package' : 'Share capture',
      defaultPath: join(saveDir, shareTargetName(basename(dir), chosen.shape)),
      filters: isPackage
        ? [{ name: 'Zip archive', extensions: ['zip'] }]
        : [{ name: 'Web page', extensions: ['html'] }]
    }
    const { canceled, filePath } = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null

    const bytes = isPackage
      ? await writePackage(dir, pkg ?? (await preparePackage(dir)), filePath)
      : await writeStandalone(chosen.shape === 'file' ? withMedia : without, filePath)

    new Notification({
      title: 'Capture ready to share',
      body: `${basename(filePath)} · ${humanBytes(bytes)} · ${SHAPE_NOTE[chosen.shape]}`
    }).show()
    shell.showItemInFolder(filePath)
    return filePath
  } catch (err) {
    void dialog.showMessageBox({
      type: 'error',
      message: 'Could not share that capture',
      detail: err instanceof Error ? err.message : String(err)
    })
    return null
  }
}
