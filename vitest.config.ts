import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

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
      reporter: ['text', 'html', 'lcov'],
      include: ['server/domain/**/*.ts', 'server/utils/**/*.ts'],
      // Only measure files a test actually imports. Modules are deliberately scaffolded as
      // empty stubs ahead of the prompt that implements them (see CLAUDE.md); counting those
      // as 0%-covered would fail the gate for work that hasn't started yet. Once a file has
      // real logic, importing it from any test brings it under the threshold below.
      all: false,
      thresholds: {
        'server/domain/**/*.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'server/utils/**/*.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        }
      }
    }
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url))
    }
  }
})
