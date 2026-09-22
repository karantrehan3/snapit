import { API, DevAuthError, devSession, die } from './devAuth.ts'
import { isRole } from '../src/domain/rbac.ts'

/**
 * `eval $(npm run --silent token)` — shell variables for poking at the API by hand.
 *
 * Exists because the README's examples need a token, and the alternative was telling
 * somebody to copy one out of a log, which is what made the first version of this too hard
 * to start.
 */

const requested = process.argv[2] ?? 'admin'
if (!isRole(requested)) die(`Unknown role "${requested}".`, 'Use admin, developer or viewer.')

try {
  const { token, workspaceId } = devSession(requested)
  console.log(`export API=${API}`)
  console.log(`export WS=${workspaceId}`)
  console.log(`export TOKEN=${token}`)
} catch (err) {
  if (err instanceof DevAuthError) die(err.message, err.hint)
  throw err
}
