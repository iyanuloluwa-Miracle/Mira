// Enforces coverage-thresholds.json against coverage/coverage-summary.json (produced by
// vitest.config.ts's 'json-summary' reporter). Exists because this vitest version's own
// built-in coverage.thresholds gate is dead code — see vitest.config.ts's comment — so
// `npm run test:coverage` alone silently reports low coverage without ever failing. Run after
// `vitest run --coverage`, never on its own (there is nothing to check without a fresh summary).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface FileSummary {
  statements: { total: number; covered: number; pct: number }
  branches: { total: number; covered: number; pct: number }
  functions: { total: number; covered: number; pct: number }
  lines: { total: number; covered: number; pct: number }
}

type CoverageSummary = Record<string, FileSummary>

type ThresholdKey = 'statements' | 'branches' | 'functions' | 'lines'
type Thresholds = Record<ThresholdKey, number>
type ThresholdsConfig = Record<string, Thresholds>

const THRESHOLD_KEYS: ThresholdKey[] = ['statements', 'branches', 'functions', 'lines']

// Hand-rolled rather than a dependency: the only shapes coverage-thresholds.json's keys ever
// take are `dir/**/*.ext` (arbitrary depth) — no need for a general-purpose glob library for
// exactly one pattern shape.
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .split('**/')
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('(?:.*/)?')
  return new RegExp(`^${escaped}$`)
}

function relativePath(absolutePath: string): string {
  return absolutePath
    .split(process.cwd() + '\\')
    .join('')
    .split(process.cwd() + '/')
    .join('')
    .replaceAll('\\', '/')
}

function main(): void {
  const thresholds: ThresholdsConfig = JSON.parse(
    readFileSync(join(process.cwd(), 'coverage-thresholds.json'), 'utf-8')
  )
  const summaryPath = join(process.cwd(), 'coverage', 'coverage-summary.json')
  let summary: CoverageSummary
  try {
    summary = JSON.parse(readFileSync(summaryPath, 'utf-8'))
  } catch {
    console.error(
      `ERROR: ${summaryPath} not found. Run "vitest run --coverage" (with the json-summary ` +
        'reporter enabled in vitest.config.ts) before checking thresholds.'
    )
    process.exit(1)
  }

  const failures: string[] = []

  for (const [glob, globThresholds] of Object.entries(thresholds)) {
    const pattern = globToRegExp(glob)
    const matchingFiles = Object.entries(summary).filter(
      ([file]) => file !== 'total' && pattern.test(relativePath(file))
    )

    if (matchingFiles.length === 0) {
      failures.push(`ERROR: No covered files matched "${glob}" — nothing to check.`)
      continue
    }

    // Per file, not aggregated across the glob — a directory-wide average would let one weak
    // file hide behind strong siblings (confirmed empirically: rate-limit.ts sitting at 66.66%
    // functions coverage did not move server/utils/**'s aggregate below 90%, since every other
    // file in that glob was at 100%). Each file named under "server/domain and server/utils"
    // needs to individually meet the bar, not just the directory on average.
    for (const [file, fileSummary] of matchingFiles) {
      for (const key of THRESHOLD_KEYS) {
        const required = globThresholds[key]
        const pct = fileSummary[key].pct
        if (pct < required) {
          failures.push(
            `ERROR: Coverage for ${key} (${pct}%) does not meet "${glob}" threshold (${required}%) for ${relativePath(file)}`
          )
        }
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure)
    process.exit(1)
  }

  console.log('All coverage thresholds met.')
}

main()
