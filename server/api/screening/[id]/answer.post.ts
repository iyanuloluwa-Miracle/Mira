// [FR2] Upserts one item response. Idempotent on (sessionId, itemCode) — a retried request on
// a poor connection overwrites the same row instead of creating a duplicate, matching the
// unique constraint on ItemResponse in prisma/schema.prisma.

import { z } from 'zod'
import { GAD7_ITEMS } from '../../../domain/instruments/gad7'
import { PHQ9_ITEMS } from '../../../domain/instruments/phq9'

// Typed as Set<string>, not the narrow itemCode union — this checks arbitrary client input
// for membership, it doesn't need (and can't have) compile-time exhaustiveness.
const VALID_ITEM_CODES: Set<string> = new Set(
  [...PHQ9_ITEMS, ...GAD7_ITEMS].map((item) => item.itemCode)
)

const bodySchema = z
  .object({
    itemCode: z.string().min(1),
    rawValue: z.number().int().min(0).max(3)
  })
  .strict()

export default defineEventHandler(async (event) => {
  const start = Date.now()
  const user = requireUser(event)

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) badRequestError('A session id is required.')

  const session = await prisma.screeningSession.findUnique({ where: { id: sessionId } })
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')
  if (session.status !== 'IN_PROGRESS') {
    badRequestError('This screening session is no longer in progress.')
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    badRequestError('itemCode (string) and rawValue (integer 0-3) are required.')
  }
  const { itemCode, rawValue } = parsed.data

  if (!VALID_ITEM_CODES.has(itemCode)) badRequestError(`Unknown item code: ${itemCode}`)

  await prisma.itemResponse.upsert({
    where: { sessionId_itemCode: { sessionId: session.id, itemCode } },
    create: { sessionId: session.id, itemCode, rawValue },
    update: { rawValue }
  })

  return { success: true, serverTimeMs: Date.now() - start }
})
