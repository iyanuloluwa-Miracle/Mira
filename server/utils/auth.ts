// [FR1][R5] Authentication primitives: argon2id password hashing and session token
// generation/hashing. Session tokens are hashed with AUTH_SECRET — a secret distinct from
// ENCRYPTION_KEY (server/utils/crypto.ts) and IDENTIFIER_HASH_PEPPER (server/utils/privacy.ts)
// — so a compromise of one secret doesn't compromise the others.

import { createHmac, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import argon2 from 'argon2'
import { Prisma, type User } from '@prisma/client'

export const SESSION_COOKIE_NAME = 'mira_session'

// Sliding expiry window: a session is valid for this long after its most recent activity.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// The session row (and cookie) are only re-issued if at least this long has passed since the
// last refresh, so an active user doesn't cause a write on every single request.
export const SESSION_REFRESH_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour

// [NFR1] A hard ceiling on top of the sliding SESSION_TTL_MS window above: even a session used
// every day, forever, is still forced to re-authenticate after this long since it was first
// created (server/middleware/auth.ts checks Session.createdAt, not just expiresAt) — an idle
// timeout alone never expires a session an attacker who stole the cookie keeps actively using.
export const SESSION_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

// [NFR1] A precomputed, valid-format argon2id hash with no corresponding real password, computed
// once and cached. Login routes verify against this when no account matches the given email, so
// that path pays the same argon2 computation cost as a real "wrong password" attempt — without
// it, an unknown-email attempt returns near-instantly while a known-email one takes the ~100ms+
// argon2.verify does, a timing side channel that would let an attacker enumerate registered
// emails by response time alone even though both paths already return an identical error and
// status code.
let dummyPasswordHash: Promise<string> | undefined

export function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword('timing-safety-placeholder-password-never-used-for-login')
  return dummyPasswordHash
}

export class MissingAuthSecretError extends Error {
  constructor() {
    super(
      'AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and set it in ' +
        '.env (see .env.example). Refusing to sign session tokens without it.'
    )
    this.name = 'MissingAuthSecretError'
  }
}

function loadAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new MissingAuthSecretError()
  return secret
}

// A raw session token is high-entropy random data, not something a user typed — unlike
// hashIdentifier (server/utils/privacy.ts) this does not trim/lowercase, since a token is
// case-sensitive and comparing it any other way would weaken it.
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHmac('sha256', loadAuthSecret()).update(token).digest('hex')
}

export function setSessionCookie(event: H3Event, token: string, expiresAt: Date): void {
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // Browsers exempt localhost from the Secure-cookie requirement, but not other local
    // hostnames/IPs (e.g. testing over LAN on a phone per NFR2) — only force Secure once
    // there's a real HTTPS deployment to force it onto.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' })
}

// [R9] Anonymous or registered, either is fine — this only requires *some* session to exist.
// Throws a generic 401 otherwise, matching the pattern every session-requiring route needs.
export function requireUser(event: H3Event): User {
  const user = event.context.user
  if (!user) unauthorizedError('An active session is required.')
  return user
}

// [FR1] Creates a server-side Session row for userId and sets the cookie for it. Shared by
// every route that starts a session: anonymous-start, register, login, claim-account.
export async function issueSession(event: H3Event, userId: string): Promise<void> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await prisma.session.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt }
  })

  setSessionCookie(event, token, expiresAt)
}

// [NFR1] Session-fixation hardening: issues a brand-new session (new token, new row) and
// invalidates the one the caller arrived with, in one call. Used on a privilege change — right
// now that's exactly one event, claim-account.post.ts's ANONYMOUS -> REGISTERED upgrade — so an
// attacker who fixed a victim's pre-registration session id gains nothing from the upgrade: the
// id that was live before it is dead immediately after. The old row is deleted, not just
// expired, so it can't be replayed even if the cookie leaked before the upgrade happened.
export async function rotateSession(event: H3Event, userId: string): Promise<void> {
  const previousSessionId = event.context.session?.id
  await issueSession(event, userId)
  if (previousSessionId) {
    await prisma.session.delete({ where: { id: previousSessionId } }).catch(() => {})
  }
}

// True if error is a Prisma unique-constraint violation (P2002) on the given column. Used
// instead of matching route-level "does this email already exist" checks alone, which have a
// check-then-create race — the database constraint is the real guarantee; this just lets a
// route turn that specific failure into a clean typed error (rule R8) instead of a raw 500.
export function isUniqueConstraintViolationOn(error: unknown, field: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes(field)
  )
}

// [FR1] Retries user creation on a pseudonym unique-constraint collision rather than letting a
// raw Prisma error escape to the client (rule R8). Collisions should be rare (24 * 24 * 100
// combinations) but are cheap to retry against.
export async function createUserWithPseudonym<T>(
  create: (pseudonym: string) => Promise<T>,
  attempts = 5
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await create(generatePseudonym())
    } catch (error) {
      if (!isUniqueConstraintViolationOn(error, 'pseudonym') || attempt === attempts) throw error
    }
  }
  // Unreachable: the loop above always returns or throws.
  throw new Error('createUserWithPseudonym: exhausted retries without returning or throwing')
}
