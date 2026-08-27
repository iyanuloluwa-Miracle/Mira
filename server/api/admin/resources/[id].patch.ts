// [FR7] Admin-only resource edit and activate/deactivate — ADMIN role required. No delete
// route: resources are never hard-deleted (see the Resource model's own comment) so historical
// ResourceRecommendation rows a past screening result links to stay valid; isActive is the
// only deactivation mechanism, exactly as it already is for the seeded/authored library.

import { z } from 'zod'

const RISK_LEVELS = ['MINIMAL', 'MILD', 'MODERATE', 'HIGH', 'CRISIS'] as const

const bodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).optional(),
    language: z.string().trim().min(2).max(10).optional(),
    tags: z.array(z.string().trim().min(1)).min(1).optional(),
    minRisk: z.enum(RISK_LEVELS).optional(),
    maxRisk: z.enum(RISK_LEVELS).optional(),
    readingTimeMinutes: z.number().int().positive().optional(),
    sourceAttribution: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required.' })

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) badRequestError('A resource id is required.')

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) badRequestError('A valid resource update is required.')
  const data = parsed.data

  const existing = await prisma.resource.findUnique({ where: { id } })
  if (!existing) notFoundError('Resource not found.')

  const minRisk = data.minRisk ?? existing.minRisk
  const maxRisk = data.maxRisk ?? existing.maxRisk
  if (RISK_LEVELS.indexOf(minRisk) > RISK_LEVELS.indexOf(maxRisk)) {
    badRequestError('minRisk must not be more severe than maxRisk.')
  }

  const resource = await prisma.resource.update({ where: { id }, data })

  await writeAuditLog({
    actorType: 'CLINICIAN',
    actorId: admin.id,
    action:
      data.isActive === false
        ? 'RESOURCE_DEACTIVATED'
        : data.isActive === true
          ? 'RESOURCE_ACTIVATED'
          : 'RESOURCE_UPDATED',
    entityType: 'Resource',
    entityId: resource.id,
    metadata: { slug: resource.slug }
  })

  return { id: resource.id, slug: resource.slug, isActive: resource.isActive }
})
