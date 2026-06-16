/**
 * Ad-hoc sign the macOS app after packaging.
 *
 * We have no Apple Developer ID (`mac.identity: null` skips electron-builder's own
 * signing), but Apple Silicon refuses to launch a binary with no signature at all —
 * macOS reports it as "damaged". An ad-hoc signature (`codesign --sign -`) satisfies
 * that requirement; the app still isn't notarized, so first launch needs a
 * right-click → Open (or `xattr -dr com.apple.quarantine`).
 */
const { execFileSync } = require('child_process')
const { join } = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
