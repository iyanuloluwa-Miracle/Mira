// [NFR1] Right to data portability — downloads everything server/utils/dsar.ts's
// exportUserData() gathers as one JSON file. Content-Disposition makes this a real download,
// not just a JSON response a browser would render inline.

import { exportUserData } from '../../utils/dsar'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  const data = await exportUserData(user.id)

  await writeAuditLog({
    actorType: 'USER',
    actorId: user.id,
    action: 'DATA_EXPORTED',
    entityType: 'User',
    entityId: user.id
  })

  setHeader(event, 'content-type', 'application/json')
  setHeader(event, 'content-disposition', 'attachment; filename="mira-my-data.json"')

  return data
})
