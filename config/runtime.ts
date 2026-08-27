// Small, explicit runtime configuration read from environment variables — see .env.example.
// Values here are safe to read in any environment; secrets stay in env vars, never here.

export type ClassifierMode = 'http' | 'mock'

export interface ClassifierConfig {
  mode: ClassifierMode
  serviceUrl: string
  timeoutMs: number
}

const DEFAULT_TIMEOUT_MS = 3000

// [R7] Defaults to 'mock' rather than 'http': an unconfigured environment degrades to a
// deterministic local signal instead of trying (and failing) to reach a classifier that was
// never set up, which would otherwise be the more surprising failure mode for e.g. a fresh
// clone running tests for the first time.
export function getClassifierConfig(): ClassifierConfig {
  const mode = process.env.CLASSIFIER_MODE === 'http' ? 'http' : 'mock'
  const serviceUrl = process.env.CLASSIFIER_SERVICE_URL ?? 'http://localhost:8001'
  const parsedTimeout = Number(process.env.CLASSIFIER_TIMEOUT_MS)
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS

  return { mode, serviceUrl, timeoutMs }
}

export type LlmMode = 'http' | 'mock'

export interface LlmConfig {
  mode: LlmMode
  apiKey: string | undefined
  model: string
  timeoutMs: number
}

const DEFAULT_LLM_TIMEOUT_MS = 8000
const DEFAULT_LLM_MODEL = 'claude-sonnet-5'

// [R6][R7] Defaults to 'mock' for the same reason getClassifierConfig() does — a fresh clone
// or the test suite must not silently start making real, billed LLM calls. Explicitly requires
// LLM_MODE="http" *and* a real LLM_API_KEY (checked by the client, not here) to reach the
// actual provider; there is no "auto-detect from API key presence" path, so a stray key in the
// environment during tests can't accidentally flip this on.
export function getLlmConfig(): LlmConfig {
  const mode = process.env.LLM_MODE === 'http' ? 'http' : 'mock'
  const apiKey = process.env.LLM_API_KEY || undefined
  const model = process.env.LLM_MODEL || DEFAULT_LLM_MODEL
  const parsedTimeout = Number(process.env.LLM_TIMEOUT_MS)
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_LLM_TIMEOUT_MS

  return { mode, apiKey, model, timeoutMs }
}

export interface RetentionConfig {
  freeTextRetentionDays: number
  abandonedSessionRetentionDays: number
  auditLogRetentionMonths: number
}

const DEFAULT_FREE_TEXT_RETENTION_DAYS = 90
const DEFAULT_ABANDONED_SESSION_RETENTION_DAYS = 30
const DEFAULT_AUDIT_LOG_RETENTION_MONTHS = 12

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// [NFR1] Storage-limitation windows for server/tasks/retention.ts. Every default here is
// documented once, consistently, across .env.example, this file, docs/ndpa-mapping.md, and the
// public /privacy notice — the retention task, the docs, and the notice a real person reads
// must never be able to drift out of sync with each other.
export function getRetentionConfig(): RetentionConfig {
  return {
    freeTextRetentionDays: parsePositiveInt(
      process.env.FREE_TEXT_RETENTION_DAYS,
      DEFAULT_FREE_TEXT_RETENTION_DAYS
    ),
    abandonedSessionRetentionDays: parsePositiveInt(
      process.env.ABANDONED_SESSION_RETENTION_DAYS,
      DEFAULT_ABANDONED_SESSION_RETENTION_DAYS
    ),
    auditLogRetentionMonths: parsePositiveInt(
      process.env.AUDIT_LOG_RETENTION_MONTHS,
      DEFAULT_AUDIT_LOG_RETENTION_MONTHS
    )
  }
}
