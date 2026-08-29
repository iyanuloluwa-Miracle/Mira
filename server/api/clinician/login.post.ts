// [FR7] Clinician-realm sign in — the parallel to server/api/auth/login.post.ts, but against
// the Clinician table via clinicianAuthRateLimiter and issueClinicianSession, never touching
// User/Session at all. Same generic-error-either-way posture as the user login route, so this
// endpoint can't be used to enumerate registered clinician emails.

import { z } from 'zod'

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(200)
  })
  .strict()

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const rateLimit = clinicianAuthRateLimiter.consume(hashIdentifier(ip))
  if (!rateLimit.allowed) tooManyRequestsError()

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) unauthorizedError()
  const { email, password } = parsed.data

  // [FR7] Clinician.email is stored in the clear (see the model's own comment) — clinicians are
  // staff, not the vulnerable population NFR1's protections are built around, so this looks up
  // directly rather than by a hash the way User login does.
  const clinician = await prisma.clinician.findUnique({ where: { email } })

  // [NFR1] Always runs, even for an email with no matching clinician account — see
  // getDummyPasswordHash's own comment for why (closes a timing-based account-enumeration side
  // channel).
  const valid = await verifyPassword(
    password,
    clinician?.passwordHash ?? (await getDummyPasswordHash())
  )

  if (!clinician || !clinician.isActive || !valid) unauthorizedError()

  await issueClinicianSession(event, clinician.id)

  return { fullName: clinician.fullName, role: clinician.role }
})
