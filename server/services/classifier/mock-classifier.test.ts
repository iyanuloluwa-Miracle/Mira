import { describe, expect, it } from 'vitest'
import { MOCK_MODEL_VERSION } from '../../domain/model-contract'
import { MockClassifier } from './mock-classifier'

const classifier = new MockClassifier()

function request(text: string) {
  return { text, requestId: 'test-request-id' }
}

describe('MockClassifier — determinism', () => {
  it('returns the exact same response for the same input, called repeatedly', async () => {
    const first = await classifier.classify(request('I have been feeling okay lately'))
    const second = await classifier.classify(request('I have been feeling okay lately'))

    expect(second.probability).toBe(first.probability)
    expect(second.label).toBe(first.label)
    expect(second.topTokens).toEqual(first.topTokens)
  })

  it('is not affected by requestId — only the text drives the result', async () => {
    const a = await classifier.classify({ text: 'same text', requestId: 'aaaa' })
    const b = await classifier.classify({ text: 'same text', requestId: 'bbbb' })

    expect(a.probability).toBe(b.probability)
    expect(a.label).toBe(b.label)
  })

  it('produces different probabilities for different text (not a constant)', async () => {
    const a = await classifier.classify(request('the weather is pleasant today'))
    const b = await classifier.classify(request('a completely different sentence entirely'))

    expect(a.probability).not.toBe(b.probability)
  })
})

describe('MockClassifier — modelVersion', () => {
  it('always reports MOCK_MODEL_VERSION, never anything that could pass for a real model', async () => {
    const response = await classifier.classify(request('anything at all'))
    expect(response.modelVersion).toBe(MOCK_MODEL_VERSION)
    expect(response.modelVersion).toBe('mock-0.1')
  })
})

describe('MockClassifier — lexicon behavior', () => {
  it('labels neutral text NON_SYMPTOMATIC', async () => {
    const response = await classifier.classify(request('I went for a walk and had lunch'))
    expect(response.label).toBe('NON_SYMPTOMATIC')
    expect(response.topTokens).toEqual([])
  })

  it('raises the probability and flips the label when concerning language is present', async () => {
    const neutral = await classifier.classify(request('a plain, unremarkable sentence'))
    const concerning = await classifier.classify(
      request('I feel hopeless and worthless, I want to give up')
    )

    expect(concerning.probability).toBeGreaterThan(neutral.probability)
    expect(concerning.label).toBe('SYMPTOMATIC')
  })

  it('reports the matched lexicon terms as topTokens with their attribution', async () => {
    const response = await classifier.classify(request('I feel hopeless today'))
    expect(response.topTokens).toContainEqual({ token: 'hopeless', attribution: 0.35 })
  })

  it('matches lexicon terms case-insensitively', async () => {
    const response = await classifier.classify(request('I feel HOPELESS today'))
    expect(response.topTokens.some((t) => t.token === 'hopeless')).toBe(true)
  })

  it('caps probability at 1 even with many overlapping matches', async () => {
    const response = await classifier.classify(
      request(
        "hopeless worthless no point can't go on give up empty inside burden tired of everything"
      )
    )
    expect(response.probability).toBe(1)
  })
})

describe('MockClassifier — response shape', () => {
  it('always returns a non-negative latencyMs', async () => {
    const response = await classifier.classify(request('anything'))
    expect(response.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('sets a stable modelName', async () => {
    const response = await classifier.classify(request('anything'))
    expect(response.modelName).toBe('mira-mock-classifier')
  })
})
