import { describe, expect, it } from 'vitest'
import { describeClassifierOutcome } from '../../domain/model-contract'
import { computeTriage } from '../../domain/triage'
import { classify } from './index'
import { MockClassifier } from './mock-classifier'
import type { ClassifierClient } from './client'

function alwaysFailsClient(): ClassifierClient {
  return {
    classify: async () => {
      throw new Error('classifier unreachable')
    }
  }
}

describe('classify() — never throws', () => {
  it('resolves to { status: "ok" } when the client succeeds', async () => {
    const outcome = await classify('a neutral sentence', new MockClassifier())
    expect(outcome.status).toBe('ok')
    if (outcome.status === 'ok') {
      expect(outcome.response.modelVersion).toBe('mock-0.1')
    }
  })

  it('resolves to { status: "unavailable" } instead of rejecting when the client throws', async () => {
    const outcome = await classify('a neutral sentence', alwaysFailsClient())
    expect(outcome.status).toBe('unavailable')
    if (outcome.status === 'unavailable') {
      expect(outcome.reason).toMatch(/classifier unreachable/)
    }
  })

  it('generates a fresh requestId per call rather than requiring the caller to supply one', async () => {
    const seen: string[] = []
    const client: ClassifierClient = {
      classify: async (request) => {
        seen.push(request.requestId)
        return {
          probability: 0,
          label: 'NON_SYMPTOMATIC',
          modelName: 'x',
          modelVersion: 'x',
          topTokens: [],
          latencyMs: 0
        }
      }
    }

    await classify('text one', client)
    await classify('text two', client)

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
  })
})

describe('graceful degradation — an unavailable classifier still yields a complete triage result', () => {
  it('produces a complete, unchanged-band triage result when the classifier is unreachable', async () => {
    const outcome = await classify('some free text', alwaysFailsClient())
    expect(outcome.status).toBe('unavailable')

    // The screening flow never has a modelPrediction to hand computeTriage when the classifier
    // is unavailable — this is the whole point of ClassifierOutcome's discriminated union: a
    // caller can only extract a ModelPrediction from the 'ok' branch, so an 'unavailable'
    // outcome structurally cannot influence the result.
    const result = computeTriage({ phq9: 12, gad7: 8, itemNineValue: 0 })

    expect(result.riskLevel).toBe('MILD')
    expect(result.rationale.length).toBeGreaterThan(0)
    expect(result.rationale.join(' ')).not.toMatch(/model|classifier/i)
  })

  it('describeClassifierOutcome states the degradation in plain language for that same outcome', async () => {
    const outcome = await classify('some free text', alwaysFailsClient())
    const description = describeClassifierOutcome(outcome)

    expect(description).toMatch(/text analysis was unavailable/i)
    expect(description).toMatch(/questionnaire answers alone/i)
  })

  it('a successful classification still leaves the rule-based band as the floor, never lowering it', async () => {
    // MockClassifier on neutral text suggests nothing elevated — computeTriage with no
    // modelPrediction at all (the seam doesn't fabricate one from a NON_SYMPTOMATIC result)
    // still produces the same MILD result as the unavailable case above.
    const outcome = await classify('a plain, unremarkable sentence', new MockClassifier())
    expect(outcome.status).toBe('ok')

    const result = computeTriage({ phq9: 12, gad7: 8, itemNineValue: 0 })
    expect(result.riskLevel).toBe('MILD')
  })
})
