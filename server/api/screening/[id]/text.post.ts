// [FR3][NFR5][R4][R5][R7] The optional free-text step, after the instruments. Body is either
// { text } (submit) or { skip: true } (the per-session exclude setting — freeTextExcluded).
// Idempotent: retrying after the first call already succeeded is a harmless no-op, matching
// answer.post.ts's upsert and complete.post.ts's "already completed" short-circuit elsewhere in
// this API.
//
// The plaintext `text` variable below exists only for this handler's scope: it is passed to
// encryptField (stored) and classify() (the classifier service — the only other destination
// rule R7/FR3 allow it to reach) and nowhere else. It is never passed to logger/writeAuditLog,
// never included in the response, and goes out of scope (eligible for GC) the moment this
// handler returns.

import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { FREE_TEXT_MAX_LENGTH } from '../../../../shared/freeText'
import { classify } from '../../../services/classifier'
import { encryptField, toPrismaBytes } from '../../../utils/crypto'

const bodySchema = z.union([
  z.object({ text: z.string().trim().min(1).max(FREE_TEXT_MAX_LENGTH) }).strict(),
  z.object({ skip: z.literal(true) }).strict()
])

export default defineEventHandler(async (event) => {
  const start = Date.now()
  const user = requireUser(event)

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) badRequestError('A session id is required.')

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: { freeTextEntries: { select: { id: true } } }
  })
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')
  if (session.status !== 'IN_PROGRESS') {
    badRequestError('This screening session is no longer in progress.')
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    badRequestError('Provide either { text } (a non-empty string) or { skip: true }.')
  const body = parsed.data

  if (session.freeTextEntries.length > 0 || session.freeTextExcluded) {
    return { success: true, serverTimeMs: Date.now() - start }
  }

  if ('skip' in body) {
    await prisma.screeningSession.update({
      where: { id: session.id },
      data: { freeTextExcluded: true }
    })
    return { success: true, serverTimeMs: Date.now() - start }
  }

  const { text } = body

  const encrypted = encryptField(text)
  await prisma.freeTextEntry.create({
    data: {
      sessionId: session.id,
      ciphertext: toPrismaBytes(encrypted.ciphertext),
      iv: toPrismaBytes(encrypted.iv),
      authTag: toPrismaBytes(encrypted.authTag),
      charCount: text.length
    }
  })

  // [R7] A classifier failure never fails this request — the entry above is already durably
  // stored. No ModelPrediction row just means complete.post.ts proceeds without one, same as
  // if free text had never been submitted at all.
  const outcome = await classify(text)
  if (outcome.status === 'ok') {
    await prisma.modelPrediction.create({
      data: {
        sessionId: session.id,
        modelName: outcome.response.modelName,
        modelVersion: outcome.response.modelVersion,
        probability: outcome.response.probability,
        predictedLabel: outcome.response.label,
        latencyMs: Math.round(outcome.response.latencyMs),
        // Prisma's InputJsonValue type is stricter than a plain array type — the classifier's
        // own response schema (server/services/classifier/http-classifier.ts) already
        // guarantees this is JSON-serializable.
        topTokensJson: outcome.response.topTokens as unknown as Prisma.InputJsonValue
      }
    })
  }

  await writeAuditLog({
    actorType: 'USER',
    actorId: user.id,
    action: 'FREE_TEXT_SUBMITTED',
    entityType: 'ScreeningSession',
    entityId: session.id,
    metadata: { classifierAvailable: outcome.status === 'ok' }
  })

  return { success: true, serverTimeMs: Date.now() - start }
})
