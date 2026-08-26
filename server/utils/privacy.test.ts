import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generatePseudonym, hashIdentifier, redactForLogs } from './privacy'

const ORIGINAL_PEPPER = process.env.IDENTIFIER_HASH_PEPPER

afterEach(() => {
  if (ORIGINAL_PEPPER === undefined) delete process.env.IDENTIFIER_HASH_PEPPER
  else process.env.IDENTIFIER_HASH_PEPPER = ORIGINAL_PEPPER
})

describe('hashIdentifier', () => {
  beforeEach(() => {
    process.env.IDENTIFIER_HASH_PEPPER = 'test-pepper-do-not-use-in-production'
  })

  it('is stable for the same input', () => {
    expect(hashIdentifier('user@example.com')).toBe(hashIdentifier('user@example.com'))
  })

  it('normalizes case and surrounding whitespace before hashing', () => {
    expect(hashIdentifier('User@Example.com')).toBe(hashIdentifier(' user@example.com '))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashIdentifier('a@example.com')).not.toBe(hashIdentifier('b@example.com'))
  })

  it('does not reveal the input in its output and looks like a sha256 hex digest', () => {
    const hash = hashIdentifier('user@example.com')
    expect(hash).not.toContain('user')
    expect(hash).not.toContain('example')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces a different hash for the same input under a different pepper', () => {
    const first = hashIdentifier('user@example.com')
    process.env.IDENTIFIER_HASH_PEPPER = 'a-completely-different-pepper'
    const second = hashIdentifier('user@example.com')
    expect(first).not.toBe(second)
  })

  it('works for IP addresses too, not just emails', () => {
    expect(hashIdentifier('203.0.113.42')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('throws a clear, named error when no pepper is configured', () => {
    delete process.env.IDENTIFIER_HASH_PEPPER
    expect(() => hashIdentifier('user@example.com')).toThrow(/IDENTIFIER_HASH_PEPPER/)
  })
})

describe('generatePseudonym', () => {
  it('produces an adjective-noun-number handle', () => {
    expect(generatePseudonym()).toMatch(/^[a-z]+-[a-z]+-\d{1,2}$/)
  })

  it('produces varied output across many calls', () => {
    const samples = new Set(Array.from({ length: 30 }, () => generatePseudonym()))
    expect(samples.size).toBeGreaterThan(1)
  })
})

describe('redactForLogs', () => {
  it('redacts denylisted keys at the top level', () => {
    const result = redactForLogs({ email: 'user@example.com', riskLevel: 'HIGH' }) as Record<
      string,
      unknown
    >
    expect(result.email).toBe('[REDACTED]')
    expect(result.riskLevel).toBe('HIGH')
  })

  it('redacts every key on the denylist', () => {
    const input = {
      text: 'a',
      response: 'b',
      message: 'c',
      email: 'd',
      ip: 'e',
      token: 'f',
      answer: 'g',
      transcript: 'h'
    }
    const result = redactForLogs(input) as Record<string, unknown>
    for (const key of Object.keys(input)) {
      expect(result[key]).toBe('[REDACTED]')
    }
  })

  it('redacts denylisted keys nested inside objects and arrays', () => {
    const input = {
      session: { user: { email: 'user@example.com' } },
      messages: [{ text: 'hello' }, { text: 'world' }]
    }
    const result = redactForLogs(input) as {
      session: { user: { email: string } }
      messages: { text: string }[]
    }
    expect(result.session.user.email).toBe('[REDACTED]')
    expect(result.messages[0]?.text).toBe('[REDACTED]')
    expect(result.messages[1]?.text).toBe('[REDACTED]')
  })

  it('matches denylisted keys case-insensitively', () => {
    const result = redactForLogs({ Email: 'user@example.com', TOKEN: 'abc' }) as Record<
      string,
      unknown
    >
    expect(result.Email).toBe('[REDACTED]')
    expect(result.TOKEN).toBe('[REDACTED]')
  })

  it('truncates long non-denylisted strings', () => {
    const longValue = 'x'.repeat(1000)
    const result = redactForLogs({ note: longValue }) as Record<string, unknown>
    expect((result.note as string).length).toBeLessThan(1000)
    expect(result.note).toContain('[truncated]')
  })

  it('leaves short, non-denylisted values untouched', () => {
    expect(redactForLogs({ riskLevel: 'HIGH', count: 3, active: true })).toEqual({
      riskLevel: 'HIGH',
      count: 3,
      active: true
    })
  })

  it('passes primitives and null through unchanged', () => {
    expect(redactForLogs(42)).toBe(42)
    expect(redactForLogs(true)).toBe(true)
    expect(redactForLogs(null)).toBe(null)
    expect(redactForLogs(undefined)).toBe(undefined)
  })

  it('summarizes buffers instead of dumping their bytes', () => {
    const result = redactForLogs({ ciphertext: Buffer.from('secret') }) as Record<string, unknown>
    expect(result.ciphertext).toBe('[Buffer 6 bytes]')
  })

  it('serializes dates to ISO strings', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    expect(redactForLogs({ createdAt: date })).toEqual({ createdAt: '2026-01-01T00:00:00.000Z' })
  })

  it('handles circular references without throwing', () => {
    const circular: Record<string, unknown> = { name: 'x' }
    circular.self = circular
    expect(() => redactForLogs(circular)).not.toThrow()
    expect((redactForLogs(circular) as Record<string, unknown>).self).toBe('[CIRCULAR]')
  })
})
