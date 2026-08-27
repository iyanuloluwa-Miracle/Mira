// [FR7] Admin-only resource creation — ADMIN role required (requireAdmin), not just any
// clinician. content/resources/*.md plus prisma/seed.ts remain the source of truth for the
// initial library; this is for adding to it afterward without a redeploy. Every field mirrors
// prisma/resource-content.ts's own validation, so a resource created here and one authored as
// a markdown file are held to the same shape.

import { z } from 'zod'

const RISK_LEVELS = ['MINIMAL', 'MILD', 'MODERATE', 'HIGH', 'CRISIS'] as const

const bodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
    body: z.string().trim().min(1),
    language: z.string().trim().min(2).max(10).default('en'),
    tags: z.array(z.string().trim().min(1)).min(1),
    minRisk: z.enum(RISK_LEVELS),
    maxRisk: z.enum(RISK_LEVELS),
    readingTimeMinutes: z.number().int().positive(),
    sourceAttribution: z.string().trim().min(1)
  })
  .strict()
  .refine((data) => RISK_LEVELS.indexOf(data.minRisk) <= RISK_LEVELS.indexOf(data.maxRisk), {
    message: 'minRisk must not be more severe than maxRisk',
    path: ['minRisk']
  })

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) badRequestError('A valid resource is required: ' + parsed.error.message)
  const data = parsed.data

  const existing = await prisma.resource.findUnique({ where: { slug: data.slug } })
  if (existing) conflictError('A resource with this slug already exists.')

  const resource = await prisma.resource.create({ data: { ...data, isActive: true } })

  await writeAuditLog({
    actorType: 'CLINICIAN',
    actorId: admin.id,
    action: 'RESOURCE_CREATED',
    entityType: 'Resource',
    entityId: resource.id,
    metadata: { slug: resource.slug }
  })

  return { id: resource.id, slug: resource.slug }
})
