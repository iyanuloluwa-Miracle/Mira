import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import coverageThresholds from './coverage-thresholds.json'

// https://vitest.dev/config/
export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    include: [
      'server/**/*.{test,spec}.ts',
      'app/**/*.{test,spec}.ts',
      'tests/unit/**/*.{test,spec}.ts',
      'tests/integration/**/*.{test,spec}.ts'
    ],
    exclude: ['node_modules', '.nuxt', '.output', 'tests/e2e/**', 'services/classifier/**'],
    coverage: {
      provider: 'v8',
      // json-summary feeds scripts/check-coverage-thresholds.ts — this vitest version's own
      // built-in threshold gate (coverage.thresholds below) is dead code (confirmed: the
      // coverage-v8 provider's reportThresholds() method is never called from anywhere in the
      // installed vitest/@vitest/coverage-v8 3.0.4), so `npm run test:coverage` has never
      // actually failed on a threshold miss despite this config implying it does. The check
      // script restores real enforcement, reading the exact same numbers from
      // coverage-thresholds.json so the two can't drift apart.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['server/domain/**/*.ts', 'server/utils/**/*.ts'],
      // Only measure files a test actually imports. Modules are deliberately scaffolded as
      // empty stubs ahead of the prompt that implements them (see CLAUDE.md); counting those
      // as 0%-covered would fail the gate for work that hasn't started yet. Once a file has
      // real logic, importing it from any test brings it under the threshold below.
      all: false,
      thresholds: coverageThresholds
    }
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url))
    }
  }
})
