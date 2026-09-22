import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * `@snapit/core` is bundled, not externalized.
 *
 * Every other dependency is required at runtime from node_modules, which electron-builder
 * ships alongside `out/`. A workspace package resolved through a symlink is the one case
 * that does not travel reliably that way — and core has no dependencies of its own, so
 * bundling it into `out/main` costs nothing and removes the packaging question entirely.
 */
const CORE = '@snapit/core'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [CORE] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [CORE] })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@preload': resolve('src/preload')
      }
    },
    plugins: [react()]
  }
})
