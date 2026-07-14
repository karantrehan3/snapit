import { defineConfig } from 'vitest/config'

// Tests live in a `tests/` folder next to the code they cover (src/**/tests/*.spec.ts).
export default defineConfig({
  test: {
    include: ['src/**/tests/**/*.spec.ts'],
    environment: 'node'
  }
})
