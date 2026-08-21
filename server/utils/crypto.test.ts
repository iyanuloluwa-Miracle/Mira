import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertEncryptionKeyPresent, decryptField, encryptField } from './crypto'

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY
})

describe('with a valid key', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
  })

  it('round-trips plaintext through encryptField/decryptField', () => {
    const plaintext = 'a free-text screening answer that must never be stored as plaintext'
    const encrypted = encryptField(plaintext)
    expect(decryptField(encrypted)).toBe(plaintext)
  })

  it('round-trips an empty string', () => {
    expect(decryptField(encryptField(''))).toBe('')
  })

  it('round-trips multi-byte unicode content', () => {
    const plaintext = 'I feel 😔 and tired — não consigo dormir'
    expect(decryptField(encryptField(plaintext))).toBe(plaintext)
  })

  it('produces a fresh iv and ciphertext for the same plaintext each call', () => {
    const a = encryptField('same input')
    const b = encryptField('same input')
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
  })

  it('rejects decryption when the authTag has been tampered with', () => {
    const encrypted = encryptField('do not tamper with me')
    const tampered = { ...encrypted, authTag: Buffer.from(encrypted.authTag) }
    tampered.authTag[0] = (tampered.authTag[0] ?? 0) ^ 0xff
    expect(() => decryptField(tampered)).toThrow()
  })

  it('rejects decryption when the ciphertext has been tampered with', () => {
    const encrypted = encryptField('do not tamper with me either')
    const tampered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) }
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 0xff
    expect(() => decryptField(tampered)).toThrow()
  })

  it('rejects decryption with the wrong key', () => {
    const encrypted = encryptField('encrypted under key A')
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
    expect(() => decryptField(encrypted)).toThrow()
  })

  it('assertEncryptionKeyPresent does not throw when the key is valid', () => {
    expect(() => assertEncryptionKeyPresent()).not.toThrow()
  })
})

describe('without a key', () => {
  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY
  })

  it('assertEncryptionKeyPresent throws a clear, named error', () => {
    expect(() => assertEncryptionKeyPresent()).toThrow(/ENCRYPTION_KEY/)
  })

  it('encryptField throws rather than silently using a fallback key', () => {
    expect(() => encryptField('x')).toThrow(/ENCRYPTION_KEY/)
  })

  it('decryptField throws rather than silently using a fallback key', () => {
    expect(() =>
      decryptField({ ciphertext: Buffer.alloc(0), iv: Buffer.alloc(12), authTag: Buffer.alloc(16) })
    ).toThrow(/ENCRYPTION_KEY/)
  })
})

describe('with a malformed key', () => {
  it('throws when the key does not decode to 32 bytes', () => {
    process.env.ENCRYPTION_KEY = Buffer.from('too-short').toString('base64')
    expect(() => assertEncryptionKeyPresent()).toThrow(/32-byte/)
  })
})
