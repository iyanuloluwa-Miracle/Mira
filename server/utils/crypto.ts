// [R5][NFR1] AES-256-GCM encryption/decryption for free text and clinician notes at rest.
// The app refuses to boot without valid key material — see
// server/plugins/verify-encryption-key.ts, which calls assertEncryptionKeyPresent() at
// startup so a misconfigured deployment fails fast rather than silently storing plaintext.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12

export interface EncryptedField {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and set it in ' +
        '.env (see .env.example). Refusing to start without it — CLAUDE.md rule R5.'
    )
    this.name = 'MissingEncryptionKeyError'
  }
}

export class InvalidEncryptionKeyError extends Error {
  constructor(reason: string) {
    super(`ENCRYPTION_KEY is set but invalid: ${reason}`)
    this.name = 'InvalidEncryptionKeyError'
  }
}

function loadEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new MissingEncryptionKeyError()
  const key = Buffer.from(raw, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new InvalidEncryptionKeyError(
      `expected a base64-encoded ${KEY_BYTES}-byte key, got ${key.length} bytes`
    )
  }
  return key
}

// Called at server boot so a missing or malformed key fails the process immediately instead of
// failing on the first request that happens to touch encrypted data.
export function assertEncryptionKeyPresent(): void {
  loadEncryptionKey()
}

export function encryptField(plaintext: string): EncryptedField {
  const key = loadEncryptionKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { ciphertext, iv, authTag }
}

// Throws if the key is wrong or if ciphertext/iv/authTag have been tampered with — GCM
// authenticates the data as part of decryption, it doesn't just decrypt it optimistically.
export function decryptField(record: EncryptedField): string {
  const key = loadEncryptionKey()
  const decipher = createDecipheriv(ALGORITHM, key, record.iv)
  decipher.setAuthTag(record.authTag)
  const plaintext = Buffer.concat([decipher.update(record.ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}

// Prisma's generated types for `Bytes` columns expect `Uint8Array<ArrayBuffer>` specifically
// (per current @types/node), while Node's Buffer is typed `Uint8Array<ArrayBufferLike>` — a
// real Buffer here is never actually backed by a SharedArrayBuffer, so this narrows a
// compile-time-only mismatch, not a runtime one. Use when passing EncryptedField bytes into a
// Prisma create/update call.
export function toPrismaBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return buffer as unknown as Uint8Array<ArrayBuffer>
}
