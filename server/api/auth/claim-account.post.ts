// [FR1][R9] Upgrades the caller's existing anonymous session to a registered account in
// place — same User.id, so every ScreeningSession/ConsentRecord already linked to them stays
// linked. This is what lets someone start anonymously and only decide to register later
// without losing their history, per the confidentiality-first design.

import { z } from 'zod'

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(200)
  })
  .strict()

export default defineEventHandler(async (event) => {
  const currentUser = event.context.user
  if (!currentUser) unauthorizedError('An active session is required to claim an account.')
  if (currentUser.authMode !== 'ANONYMOUS') {
    badRequestError('This session is already registered.')
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const rateLimit = authRateLimiter.consume(hashIdentifier(ip))
  if (!rateLimit.allowed) tooManyRequestsError()

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    badRequestError('A valid email and a password of at least 8 characters are required.')
  const { email, password } = parsed.data

  const emailHash = hashIdentifier(email)

  const existing = await prisma.user.findUnique({ where: { emailHash } })
  if (existing) conflictError('An account with this email already exists.')

  const passwordHash = await hashPassword(password)
  const encryptedEmail = encryptField(email)

  try {
    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        authMode: 'REGISTERED',
        emailHash,
        emailCiphertext: toPrismaBytes(encryptedEmail.ciphertext),
        emailIv: toPrismaBytes(encryptedEmail.iv),
        emailAuthTag: toPrismaBytes(encryptedEmail.authTag),
        passwordHash
      }
    })

    return { pseudonym: user.pseudonym, authMode: user.authMode }
  } catch (error) {
    // Defensive fallback for the check-then-update race the findUnique above can't close on
    // its own (rare, but real, under concurrent claims with the same email).
    if (isUniqueConstraintViolationOn(error, 'emailHash')) {
      conflictError('An account with this email already exists.')
    }
    throw error
  }
})
