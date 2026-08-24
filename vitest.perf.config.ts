import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/perf/**/*.perf.test.tsx', 'tests/perf/**/*.perf.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
})
