// [NFR1][R4] Identity-privacy helpers: keyed hashing for identifiers (never store raw email
// or IP), pseudonym generation for the anonymous-first-class path (rule R9), and log
// redaction (rule R4). See docs/privacy-controls.md for how each of these maps to a Nigeria
// Data Protection Act 2023 principle.

import { createHmac, randomInt } from 'node:crypto'

export class MissingHashPepperError extends Error {
  constructor() {
    super(
      'IDENTIFIER_HASH_PEPPER is not set. Generate one with `openssl rand -base64 32` and set ' +
        'it in .env (see .env.example). Refusing to hash identifiers without it.'
    )
    this.name = 'MissingHashPepperError'
  }
}

function loadPepper(): string {
  const pepper = process.env.IDENTIFIER_HASH_PEPPER
  if (!pepper) throw new MissingHashPepperError()
  return pepper
}

// [FR1][NFR1] Keyed HMAC-SHA256 hash of an identifier such as an email address or IP. One-way
// and deterministic: the same value always hashes the same way, which is what lets the app look
// a user up by email without ever storing the email itself — the pepper (distinct from
// ENCRYPTION_KEY, see server/utils/crypto.ts) is what keeps the hash infeasible to reverse via a
// precomputed table without server-side secret material. Email input is trimmed and
// lowercased first so the same address hashes identically regardless of how it was typed.
export function hashIdentifier(value: string): string {
  const pepper = loadPepper()
  return createHmac('sha256', pepper).update(value.trim().toLowerCase()).digest('hex')
}

const ADJECTIVES = [
  'quiet',
  'calm',
  'gentle',
  'steady',
  'bright',
  'soft',
  'warm',
  'clear',
  'kind',
  'still',
  'mellow',
  'easy',
  'light',
  'open',
  'fresh',
  'true',
  'brave',
  'patient',
  'hopeful',
  'grounded',
  'settled',
  'earnest',
  'sincere',
  'tender'
] as const

const NOUNS = [
  'harbour',
  'meadow',
  'river',
  'garden',
  'valley',
  'horizon',
  'orchard',
  'summit',
  'lantern',
  'willow',
  'brook',
  'shore',
  'grove',
  'bridge',
  'trail',
  'haven',
  'compass',
  'anchor',
  'cedar',
  'canyon',
  'plateau',
  'harbor',
  'meridian',
  'stream'
] as const

// [FR1][R9] A memorable, non-identifying handle (e.g. "quiet-harbour-41") shown back to the
// person and to clinicians instead of any real identifier. Uniqueness is a database concern
// for the caller (retry on a unique-constraint collision), not this pure generator.
export function generatePseudonym(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)]
  const noun = NOUNS[randomInt(NOUNS.length)]
  const number = randomInt(100)
  return `${adjective}-${noun}-${number}`
}

const DENYLISTED_KEYS = new Set([
  'text',
  'response',
  'message',
  'email',
  'ip',
  'token',
  'answer',
  'transcript'
])

const REDACTED = '[REDACTED]'
const CIRCULAR = '[CIRCULAR]'
const MAX_STRING_LENGTH = 500
const TRUNCATED_SUFFIX = '…[truncated]'

// [R4] Strips any value keyed by a denylisted name (case-insensitively, at any depth) and
// truncates the rest, so a stray field never carries plaintext free text, chat content, an
// identifier or a token into a log line by accident. Prefer server/utils/logger.ts, which
// applies this automatically, over calling this directly.
export function redactForLogs(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? value.slice(0, MAX_STRING_LENGTH) + TRUNCATED_SUFFIX
      : value
  }

  if (value === null || typeof value !== 'object') return value

  if (seen.has(value)) return CIRCULAR
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redactForLogs(item, seen))
  }

  if (value instanceof Date) return value.toISOString()

  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`

  const result: Record<string, unknown> = {}
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    result[key] = DENYLISTED_KEYS.has(key.toLowerCase())
      ? REDACTED
      : redactForLogs(entryValue, seen)
  }
  return result
}
