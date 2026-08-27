// [FR5] Lists every active psychoeducational resource. Deliberately no requireUser() call —
// resources are reachable without completing a screening and without an account, the same
// zero-auth posture as server/api/instruments/[code].get.ts. Only the fields a listing needs:
// no body (that's the detail route's job) and no sourceAttribution (not relevant until someone
// is actually reading the article).

export default defineEventHandler(async () => {
  const resources = await prisma.resource.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      title: true,
      tags: true,
      minRisk: true,
      maxRisk: true,
      readingTimeMinutes: true,
      language: true
    },
    orderBy: { title: 'asc' }
  })

  return { resources }
})
