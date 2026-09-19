import { defineConfig } from 'vitest/config'

// Mirrors the root config's convention: tests sit in a `tests/` folder next to the code
// they cover. Rooted here so the app's own `npm test` neither runs these nor is slowed
// by them — the prototype must not be able to fail the product's suite.
export default defineConfig({
  test: { include: ['src/**/tests/**/*.spec.ts'], environment: 'node' }
})
