// [FR1] Registered-mode entry path: email + password. Always creates a fresh User — a caller
// who already has an anonymous session and wants to upgrade it in place should call
// claim-account.post.ts instead, which preserves their existing history.

import { z } from 'zod'

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(200)
  })
  .strict()

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const rateLimit = authRateLimiter.consume(hashIdentifier(ip))
  if (!rateLimit.allowed) tooManyRequestsError()

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    badRequestError('A valid email and a password of at least 8 characters are required.')
  const { email, password } = parsed.data

  const emailHash = hashIdentifier(email)
  const passwordHash = await hashPassword(password)
  const encryptedEmail = encryptField(email)

  try {
    const user = await createUserWithPseudonym((pseudonym) =>
      prisma.user.create({
        data: {
          pseudonym,
          authMode: 'REGISTERED',
          emailHash,
          emailCiphertext: toPrismaBytes(encryptedEmail.ciphertext),
          emailIv: toPrismaBytes(encryptedEmail.iv),
          emailAuthTag: toPrismaBytes(encryptedEmail.authTag),
          passwordHash
        }
      })
    )

    await issueSession(event, user.id)

    return { pseudonym: user.pseudonym, authMode: user.authMode }
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, 'emailHash')) {
      conflictError('An account with this email already exists.')
    }
    throw error
  }
})
