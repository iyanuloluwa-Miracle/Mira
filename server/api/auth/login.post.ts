// [FR1] Registered-mode sign in. Deliberately returns the same generic error whether the
// email isn't registered or the password is wrong, so the endpoint can't be used to enumerate
// which emails have accounts.

import { z } from 'zod'

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(200)
  })
  .strict()

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const rateLimit = authRateLimiter.consume(hashIdentifier(ip))
  if (!rateLimit.allowed) tooManyRequestsError()

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) unauthorizedError()
  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { emailHash: hashIdentifier(email) } })

  // [NFR1] Always runs, even for an email with no matching account — see getDummyPasswordHash's
  // own comment for why (closes a timing-based account-enumeration side channel).
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyPasswordHash()))

  if (!user || !user.passwordHash || user.deletedAt || !valid) unauthorizedError()

  await issueSession(event, user.id)

  return { pseudonym: user.pseudonym, authMode: user.authMode }
})
