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
