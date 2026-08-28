// [NFR1] Double-submit-cookie CSRF protection. The cookie is set (once, and reused thereafter)
// on every response regardless of method; the check itself only applies to state-changing
// requests, and only compares the cookie against a header an attacker's cross-site request
// cannot set — the SameSite=lax attribute already shared by every cookie this app issues
// (server/utils/auth.ts, server/utils/clinician-auth.ts) blocks the classic cross-site POST
// vector on its own in a modern browser, but this is defense in depth for anyone on an older
// browser or a low-cost Android WebView that predates consistent SameSite enforcement — a real
// part of this app's audience (NFR2).
//
// Deliberately NOT httpOnly: the token has to be readable by the app's own client-side
// JavaScript so it can be echoed back as a header (app/plugins/csrf.client.ts). It carries no
// authority on its own — knowing it without also holding the session cookie proves nothing —
// so this is not a rule R5/R4 concern the way the session token is.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

export const CSRF_COOKIE_NAME = 'mira_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url')
}

// [NFR1] Issues the cookie if the request doesn't already carry one — called unconditionally,
// early, so every response (API or page) sets it exactly once per browser and every subsequent
// mutating request already has both halves of the pair available.
export function ensureCsrfCookie(event: H3Event): void {
  if (getCookie(event, CSRF_COOKIE_NAME)) return

  setCookie(event, CSRF_COOKIE_NAME, generateCsrfToken(), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  })
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

// [NFR1] Rejects a state-changing request whose x-csrf-token header doesn't match its own
// mira_csrf cookie. A cross-site attacker's forged request either carries no cookie at all
// (SameSite=lax already stopped it) or, on a browser that doesn't enforce that, still can't
// read the cookie's value (blocked by the same-origin policy) to put it in the header —
// same-site JavaScript is the only thing that can ever produce a request where both match.
export function requireMatchingCsrfToken(event: H3Event): void {
  if (SAFE_METHODS.has(event.method)) return

  const cookieToken = getCookie(event, CSRF_COOKIE_NAME)
  const headerToken = getHeader(event, CSRF_HEADER_NAME)

  if (!cookieToken || !headerToken || !timingSafeStringEqual(cookieToken, headerToken)) {
    forbiddenError('Missing or invalid CSRF token.')
  }
}
