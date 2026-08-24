// [FR3][R7] The only way anything outside this folder should talk to the classifier.
// classify() never throws and never rejects a screening — every failure mode collapses into
// { status: 'unavailable' }, so a caller can't accidentally let a classifier outage become a
// screening outage by forgetting a try/catch.

import { randomUUID } from 'node:crypto'
import { getClassifierConfig } from '../../../config/runtime'
import type { ClassifierOutcome } from '../../domain/model-contract'
import type { ClassifierClient } from './client'
import { HttpClassifier } from './http-classifier'
import { MockClassifier } from './mock-classifier'

export type { ClassifierClient } from './client'
export { CircuitBreaker, type CircuitBreakerState } from './circuit-breaker'
export { HttpClassifier } from './http-classifier'
export { MockClassifier } from './mock-classifier'

export function createClassifierClient(): ClassifierClient {
  const config = getClassifierConfig()
  if (config.mode === 'http') {
    return new HttpClassifier({ baseUrl: config.serviceUrl, timeoutMs: config.timeoutMs })
  }
  return new MockClassifier()
}

// Created once per process, from whatever CLASSIFIER_MODE says at startup — not re-read per
// call, so a single run behaves consistently even if env vars were mutated at runtime (tests
// aside, which pass their own client explicitly instead of relying on this).
let defaultClient: ClassifierClient | undefined

function getDefaultClient(): ClassifierClient {
  defaultClient ??= createClassifierClient()
  return defaultClient
}

// [R7] The public seam. Pass `client` explicitly in tests to bypass the module-level default
// (and its env-driven mode selection) entirely.
export async function classify(
  text: string,
  client: ClassifierClient = getDefaultClient()
): Promise<ClassifierOutcome> {
  const request = { text, requestId: randomUUID() }

  try {
    const response = await client.classify(request)
    return { status: 'ok', response }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Unknown classifier error'
    }
  }
}
