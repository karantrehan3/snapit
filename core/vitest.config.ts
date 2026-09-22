import { defineConfig } from 'vitest/config'

// Same convention as the app and the server: tests sit in a `tests/` folder beside the
// code they cover. Rooted here so `npm test` in any one package runs only its own.
export default defineConfig({
  test: { include: ['src/**/tests/**/*.spec.ts'], environment: 'node' }
})
