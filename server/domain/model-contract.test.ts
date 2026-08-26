import { describe, expect, it } from 'vitest'
import { MOCK_MODEL_VERSION, describeClassifierOutcome } from './model-contract'
import type { ClassifierOutcome } from './model-contract'

describe('MOCK_MODEL_VERSION', () => {
  it('is a stable, unmistakable-for-real identifier', () => {
    expect(MOCK_MODEL_VERSION).toBe('mock-0.1')
  })
})

describe('describeClassifierOutcome', () => {
  it('returns null when the classifier succeeded', () => {
    const outcome: ClassifierOutcome = {
      status: 'ok',
      response: {
        probability: 0.1,
        label: 'NON_SYMPTOMATIC',
        modelName: 'mira-mock-classifier',
        modelVersion: MOCK_MODEL_VERSION,
        topTokens: [],
        latencyMs: 1
      }
    }
    expect(describeClassifierOutcome(outcome)).toBeNull()
  })

  it('states plainly that text analysis was unavailable, without a raw error/reason leaking through', () => {
    const outcome: ClassifierOutcome = { status: 'unavailable', reason: 'ECONNREFUSED at 10.0.0.1' }
    const description = describeClassifierOutcome(outcome)

    expect(description).toMatch(/unavailable/i)
    expect(description).toMatch(/questionnaire answers alone/i)
    expect(description).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/)
  })

  it('never mentions a numeric score, matching the same discipline as the crisis copy', () => {
    const outcome: ClassifierOutcome = { status: 'unavailable', reason: 'timeout' }
    expect(describeClassifierOutcome(outcome)).not.toMatch(/\b\d+\s*(\/|out of)\s*\d+\b/)
  })
})
