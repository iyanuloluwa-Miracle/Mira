// [FR7] Admin listing of every resource, active and inactive — unlike the public
// GET /api/resources, which only ever shows active ones. Powers the clinician dashboard's
// resource-management page.

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  const resources = await prisma.resource.findMany({
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      slug: true,
      tags: true,
      minRisk: true,
      maxRisk: true,
      readingTimeMinutes: true,
      language: true,
      sourceAttribution: true,
      isActive: true,
      body: true
    }
  })

  return { resources }
})
