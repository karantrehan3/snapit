import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { findSaveDir } from '../src/appSettings.ts'
import { pushBundle } from '../src/client/upload.ts'
import { API, DevAuthError, devSession, die } from './devAuth.ts'
import { humanBytes } from './human.ts'

/**
 * `npm run push` — one command from a capture on disk to a link in a browser.
 *
 * This exists because the first version of trying the prototype was nine steps, three of
 * which were copying opaque strings out of a log, and it was too hard. That is worth
 * saying plainly rather than hiding in a doc: a thing nobody can start is a thing nobody
 * evaluates, and the design being sound does not help.
 *
 * It mints its own token instead of asking for one. That is legitimate precisely because
 * this is a **development** tool: it is already reading `.data/`, so it already has
 * everything the secret would protect. It does not work against a real deployment and is
 * not supposed to — there, a desktop app signs in and is issued a token by the server.
 */

/** The newest bundle: a directory holding a report.html. */
async function newestBundle(saveDir: string): Promise<string> {
  let entries: string[]
  try {
    entries = await readdir(saveDir)
  } catch {
    return die(`Cannot read ${saveDir}.`, 'Pass a bundle folder instead:  npm run push -- <folder>')
  }
  const dated = await Promise.all(
    entries.map(async (name) => {
      const dir = join(saveDir, name)
      try {
        if (!(await stat(dir)).isDirectory()) return null
        await stat(join(dir, 'report.html'))
        return { dir, mtimeMs: (await stat(dir)).mtimeMs }
      } catch {
        return null
      }
    })
  )
  const found = dated.filter((d): d is { dir: string; mtimeMs: number } => d !== null)
  if (found.length === 0) {
    return die(
      `No capture bundles in ${saveDir}.`,
      'Record a browser session in snapit first, or pass a folder:  npm run push -- <folder>'
    )
  }
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]!.dir
}

async function main(): Promise<void> {
  const given = process.argv[2]
  const saveDir = findSaveDir()
  const bundleDir = given
    ? resolve(given)
    : await newestBundle(
        saveDir ?? die('Could not find your snapit save folder.', 'Pass one:  npm run push -- <folder>')
      )

  // Admin, because a capture arrives private and turning the link on is an admin act.
  let session: ReturnType<typeof devSession>
  try {
    session = devSession('admin')
  } catch (err) {
    if (err instanceof DevAuthError) return die(err.message, err.hint)
    throw err
  }
  const { token, workspaceId } = session

  console.log(`\n  Pushing ${bundleDir}`)
  console.log(`       to ${API}\n`)

  const result = await pushBundle({
    baseUrl: API,
    token,
    workspaceId,
    bundleDir,
    // Bytes rather than a percentage: the report and the metadata are a rounding error
    // against the recording, so a percentage shows 0% three times and then 100%, which
    // reads like it is stuck.
    onProgress: ({ name, done, total }) => {
      console.log(`    ${humanBytes(done).padStart(8)} / ${humanBytes(total)}   ${name}`)
    }
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    return die(
      `Upload failed: ${message}`,
      message.includes('fetch') ? `Is the server running? ${API}` : undefined
    )
  })

  // Captures arrive private. Sharing is a separate, admin-only act — doing it here keeps
  // the demo to one command without pretending the two are the same thing.
  const shared = await fetch(`${API}/v1/captures/${result.captureId}/share`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ shared: true })
  })
  if (!shared.ok) die(`Could not enable the share link (${shared.status}).`)

  console.log(`\n  ✓ ${humanBytes(result.uploadedBytes)} uploaded\n`)
  console.log(`    ${result.shareUrl}\n`)

  if (process.env.SNAPIT_NO_OPEN !== '1' && process.platform === 'darwin') {
    spawn('open', [result.shareUrl], { detached: true, stdio: 'ignore' }).unref()
  }
}

void main()
