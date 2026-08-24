import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encryptField } from './crypto'
import { buildTextAnalysis } from './text-analysis'

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY

beforeEach(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY
})

function entryFor(text: string) {
  const encrypted = encryptField(text)
  return [{ ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag }]
}

describe('buildTextAnalysis — CRISIS', () => {
  it('is always text-free for a CRISIS result, even with a classified entry present', () => {
    const result = buildTextAnalysis({
      freeTextExcluded: false,
      freeTextEntries: entryFor('I feel hopeless'),
      modelPredictions: [{ topTokensJson: [{ token: 'hopeless', attribution: 0.35 }] }],
      riskLevel: 'CRISIS'
    })
    expect(result).toEqual({ available: false, reason: 'text-free' })
  })
})

describe('buildTextAnalysis — no free text', () => {
  it('is text-free when no entry exists at all', () => {
    const result = buildTextAnalysis({
      freeTextExcluded: false,
      freeTextEntries: [],
      modelPredictions: [],
      riskLevel: 'MINIMAL'
    })
    expect(result).toEqual({ available: false, reason: 'text-free' })
  })

  it('is text-free when the session explicitly excluded free text', () => {
    const result = buildTextAnalysis({
      freeTextExcluded: true,
      freeTextEntries: [],
      modelPredictions: [],
      riskLevel: 'MINIMAL'
    })
    expect(result).toEqual({ available: false, reason: 'text-free' })
  })

  it('is text-free when excluded even if an entry somehow exists', () => {
    const result = buildTextAnalysis({
      freeTextExcluded: true,
      freeTextEntries: entryFor('should not happen in practice'),
      modelPredictions: [],
      riskLevel: 'MINIMAL'
    })
    expect(result).toEqual({ available: false, reason: 'text-free' })
  })
})

describe('buildTextAnalysis — classifier unavailable', () => {
  it('is unavailable when an entry exists but no prediction was ever stored', () => {
    const result = buildTextAnalysis({
      freeTextExcluded: false,
      freeTextEntries: entryFor('the classifier never got to see this'),
      modelPredictions: [],
      riskLevel: 'MINIMAL'
    })
    expect(result).toEqual({ available: false, reason: 'unavailable' })
  })
})

describe('buildTextAnalysis — available', () => {
  it('decrypts the entry and computes spans over the original text', () => {
    const text = 'I feel hopeless and worthless today'
    const result = buildTextAnalysis({
      freeTextExcluded: false,
      freeTextEntries: entryFor(text),
      modelPredictions: [
        {
          topTokensJson: [
            { token: 'hopeless', attribution: 0.35 },
            { token: 'worthless', attribution: 0.4 }
          ]
        }
      ],
      riskLevel: 'MILD'
    })

    expect(result.available).toBe(true)
    if (!result.available) throw new Error('expected available result')
    expect(result.spans.map((s) => s.text).join('')).toBe(text)
    expect(result.spans.filter((s) => s.highlighted).map((s) => s.text)).toEqual([
      'hopeless',
      'worthless'
    ])
  })

  it('round-trips multi-byte text correctly end to end (encrypt, decrypt, attribute)', () => {
    const text = 'I feel 😔 hopeless — não consigo dormir'
    const result = buildTextAnalysis({
      freeTextExcluded: false,
      freeTextEntries: entryFor(text),
      modelPredictions: [{ topTokensJson: [{ token: 'hopeless', attribution: 0.35 }] }],
      riskLevel: 'MILD'
    })

    expect(result.available).toBe(true)
    if (!result.available) throw new Error('expected available result')
    expect(result.spans.map((s) => s.text).join('')).toBe(text)
  })
})
