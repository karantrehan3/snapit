import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Tests live in a `tests/` folder next to the code they cover (src/**/tests/*.spec.ts).
export default defineConfig({
  // Must mirror the aliases in electron.vite.config.ts, or a module under test that imports
  // through them fails to resolve here.
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@preload': resolve('src/preload')
    }
  },
  test: {
    include: ['src/**/tests/**/*.spec.ts'],
    environment: 'node'
  }
})
