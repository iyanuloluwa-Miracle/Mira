// [FR3][R7] Calls the real Python classifier service (services/classifier/) over HTTP. Every
// failure mode — timeout, connection refused, non-2xx, malformed body — is just a "failure" as
// far as this class and its caller are concerned; index.ts's classify() is what turns any of
// them into the uniform 'unavailable' outcome the rest of the app sees.

import { z } from 'zod'
import type { ClassifierRequest, ClassifierResponse } from '../../domain/model-contract'
import { CircuitBreaker } from './circuit-breaker'
import type { ClassifierClient } from './client'

const responseSchema = z.object({
  probability: z.number().min(0).max(1),
  label: z.enum(['SYMPTOMATIC', 'NON_SYMPTOMATIC']),
  modelName: z.string().min(1),
  modelVersion: z.string().min(1),
  topTokens: z.array(z.object({ token: z.string(), attribution: z.number() })),
  latencyMs: z.number().nonnegative()
})

export interface HttpClassifierOptions {
  baseUrl: string
  timeoutMs: number
  // Injectable for tests — defaults to the global fetch.
  fetchImpl?: typeof fetch
  // Injectable so tests can control breaker state/timing directly; a fresh instance with the
  // module's defaults is created when omitted.
  breaker?: CircuitBreaker
}

const DEFAULT_FAILURE_THRESHOLD = 5
const DEFAULT_COOLDOWN_MS = 30_000

export class HttpClassifier implements ClassifierClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly breaker: CircuitBreaker

  constructor(options: HttpClassifierOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs
    this.fetchImpl = options.fetchImpl ?? fetch
    this.breaker =
      options.breaker ??
      new CircuitBreaker({
        failureThreshold: DEFAULT_FAILURE_THRESHOLD,
        cooldownMs: DEFAULT_COOLDOWN_MS
      })
  }

  getBreakerState() {
    return this.breaker.getState()
  }

  async classify(request: ClassifierRequest): Promise<ClassifierResponse> {
    if (!this.breaker.canAttempt()) {
      throw new Error('Classifier circuit breaker is open')
    }

    try {
      const response = await this.attemptWithOneRetry(request)
      this.breaker.recordSuccess()
      return response
    } catch (error) {
      this.breaker.recordFailure()
      throw error
    }
  }

  private async attemptWithOneRetry(request: ClassifierRequest): Promise<ClassifierResponse> {
    try {
      return await this.attemptOnce(request)
    } catch {
      return await this.attemptOnce(request)
    }
  }

  private async attemptOnce(request: ClassifierRequest): Promise<ClassifierResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await this.fetchImpl(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal
      })

      if (!res.ok) throw new Error(`Classifier responded with status ${res.status}`)

      const body: unknown = await res.json()
      return responseSchema.parse(body)
    } finally {
      clearTimeout(timeout)
    }
  }
}
