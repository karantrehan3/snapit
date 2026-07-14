/**
 * Sign the macOS app after packaging.
 *
 * With `SNAPIT_SIGN_IDENTITY` set (CI imports a stable self-signed cert into the
 * keychain and passes its name) we sign with that identity, so the signature's
 * designated requirement is stable across builds — macOS then keeps the app's
 * Privacy permissions (Screen Recording, Microphone) across updates instead of
 * re-prompting every version.
 *
 * Without it (local builds, or CI with no cert secret) we fall back to an ad-hoc
 * signature (`codesign --sign -`) so Apple Silicon will still launch the app —
 * but that signature changes every build, so permissions reset on each update.
 *
 * Either way the app isn't notarized, so first launch still needs a right-click →
 * Open (or `xattr -dr com.apple.quarantine`).
 */
const { execFileSync } = require('child_process')
const { join } = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const identity = process.env.SNAPIT_SIGN_IDENTITY || '-'
  console.log(`[afterPack] codesign ${app} (identity: ${identity === '-' ? 'ad-hoc' : identity})`)
  execFileSync('codesign', ['--force', '--deep', '--sign', identity, app], { stdio: 'inherit' })
}
