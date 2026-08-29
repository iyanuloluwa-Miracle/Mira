// [NFR1] Right to erasure — a real, irreversible, cascading hard delete via
// server/utils/dsar.ts's eraseUserData(), gated on typing the account's own pseudonym exactly
// (not a generic word like "DELETE") so the confirmation is genuinely tied to the specific
// account being removed. The acting user's own Session row is cascaded away by the delete
// itself, so this clears the cookie explicitly rather than leaving a cookie pointing at nothing.

import { z } from 'zod'
import { eraseUserData } from '../../utils/dsar'

const bodySchema = z.object({ confirmation: z.string().min(1) }).strict()

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) badRequestError('A confirmation is required.')
  const { confirmation } = parsed.data

  if (confirmation !== user.pseudonym) {
    badRequestError('Type your pseudonym exactly to confirm deletion.')
  }

  // [R4] Written before the delete, not after — entityId still needs to name a User that
  // existed; the audit trail has no foreign key to that row either way (see dsar.ts's own
  // comment on why AuditLog is the one thing this deletion does not remove).
  await writeAuditLog({
    actorType: 'USER',
    actorId: user.id,
    action: 'ACCOUNT_DELETED',
    entityType: 'User',
    entityId: user.id
  })

  await eraseUserData(user.id)

  clearSessionCookie(event)

  return { deleted: true }
})
