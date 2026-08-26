// [FR4][NFR5][R3][R4] Returns the stored triage result for the owning user only, plus (for a
// non-CRISIS result with a submitted, classified free-text entry) the attribution explanation —
// see server/utils/text-analysis.ts for what that computes and why it's shared with
// complete.post.ts. Accessing a CRISIS result is itself audited, on top of the completion-time
// audit entry complete.post.ts already writes — every read of sensitive crisis data gets its
// own trail entry, not just its creation.

import { buildTextAnalysis } from '../../../utils/text-analysis'

// [FR5] Reads back the ResourceRecommendation rows persisted at completion time
// (server/api/screening/[id]/complete.post.ts computes and persists them once) rather than
// recomputing — recommendations, like the TriageResult itself, are decided once and stay stable
// afterward, even if the resource catalogue changes later.
async function loadRecommendedResources(triageResultId: string) {
  const rows = await prisma.resourceRecommendation.findMany({
    where: { triageResultId },
    orderBy: { rank: 'asc' },
    include: { resource: { select: { slug: true, title: true, readingTimeMinutes: true } } }
  })
  return rows.map((row) => ({
    slug: row.resource.slug,
    title: row.resource.title,
    readingTimeMinutes: row.resource.readingTimeMinutes
  }))
}

export default defineEventHandler(async (event) => {
  const start = Date.now()
  const user = requireUser(event)

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) badRequestError('A session id is required.')

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: {
      triageResult: true,
      freeTextEntries: { take: 1 },
      modelPredictions: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  })
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')
  if (!session.triageResult) notFoundError('This screening session has not been completed yet.')

  if (session.triageResult.riskLevel === 'CRISIS') {
    await writeAuditLog({
      actorType: 'USER',
      actorId: user.id,
      action: 'CRISIS_RESULT_ACCESSED',
      entityType: 'ScreeningSession',
      entityId: session.id
    })
  }

  const textAnalysis = buildTextAnalysis({
    freeTextExcluded: session.freeTextExcluded,
    freeTextEntries: session.freeTextEntries,
    modelPredictions: session.modelPredictions,
    riskLevel: session.triageResult.riskLevel
  })
  const resources = await loadRecommendedResources(session.triageResult.id)

  return {
    sessionId: session.id,
    phq9Total: session.triageResult.phq9Total,
    gad7Total: session.triageResult.gad7Total,
    phq9Band: session.triageResult.phq9Band,
    gad7Band: session.triageResult.gad7Band,
    riskLevel: session.triageResult.riskLevel,
    rationale: session.triageResult.rationaleJson,
    escalated: session.triageResult.escalated,
    textAnalysis,
    resources,
    serverTimeMs: Date.now() - start
  }
})
