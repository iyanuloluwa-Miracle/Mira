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
