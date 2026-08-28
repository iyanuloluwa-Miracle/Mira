// [FR7] Authentication for the clinician realm — deliberately parallel to, and never sharing a
// table, a session type, or a login page with, server/utils/auth.ts's person-being-screened
// session mechanism (see the ClinicianSession model's own comment in prisma/schema.prisma).
// Password hashing and raw token generation/hashing are genuinely generic — reused directly
// from auth.ts rather than duplicated — but everything cookie-, session-, and role-shaped below
// is its own, separate implementation.

import type { H3Event } from 'h3'
import type { Clinician } from '@prisma/client'
import { generateSessionToken, hashSessionToken } from './auth'

export const CLINICIAN_SESSION_COOKIE_NAME = 'mira_clinician_session'

// Shorter than the 30-day person-being-screened session (server/utils/auth.ts): clinician
// accounts reach case detail and clinical notes, so a shorter-lived, more-often-refreshed
// session is a reasonable hardening step for a realm with meaningfully higher blast radius.
export const CLINICIAN_SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
export const CLINICIAN_SESSION_REFRESH_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

// [NFR1] The clinician-realm counterpart to SESSION_ABSOLUTE_TTL_MS in auth.ts — shorter,
// matching this realm's shorter sliding TTL above and its higher blast radius.
export const CLINICIAN_SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function setClinicianSessionCookie(event: H3Event, token: string, expiresAt: Date): void {
  setCookie(event, CLINICIAN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  })
}

export function clearClinicianSessionCookie(event: H3Event): void {
  deleteCookie(event, CLINICIAN_SESSION_COOKIE_NAME, { path: '/' })
}

// [FR7] The clinician-realm counterpart to issueSession() in auth.ts.
export async function issueClinicianSession(event: H3Event, clinicianId: string): Promise<void> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + CLINICIAN_SESSION_TTL_MS)

  await prisma.clinicianSession.create({
    data: { clinicianId, tokenHash: hashSessionToken(token), expiresAt }
  })

  setClinicianSessionCookie(event, token, expiresAt)
}

// [FR7] Requires a valid clinician session of either role. Throws a generic 401 otherwise —
// note this checks event.context.clinician, populated only by
// server/middleware/clinician-auth.ts, never event.context.user (the person-being-screened
// session) — the two are never interchangeable, by construction.
export function requireClinician(event: H3Event): Clinician {
  const clinician = event.context.clinician
  if (!clinician) unauthorizedError('An active clinician session is required.')
  return clinician
}

// [FR7] Requires a valid clinician session with the ADMIN role specifically — for resource
// management, which a plain CLINICIAN account must not be able to reach.
export function requireAdmin(event: H3Event): Clinician {
  const clinician = requireClinician(event)
  if (clinician.role !== 'ADMIN') forbiddenError('This action requires an admin account.')
  return clinician
}
