// [FR4] The current user's past sessions, most recent first, with scores and bands for
// completed ones. Accessing any history that includes a CRISIS session is audited, same
// principle as [id]/result.get.ts.

export default defineEventHandler(async (event) => {
  const start = Date.now()
  const user = requireUser(event)

  const sessions = await prisma.screeningSession.findMany({
    where: { userId: user.id },
    include: { triageResult: true },
    orderBy: { startedAt: 'desc' }
  })

  const includesCrisis = sessions.some((session) => session.triageResult?.riskLevel === 'CRISIS')
  if (includesCrisis) {
    await writeAuditLog({
      actorType: 'USER',
      actorId: user.id,
      action: 'CRISIS_HISTORY_ACCESSED',
      entityType: 'User',
      entityId: user.id
    })
  }

  return {
    sessions: sessions.map((session) => ({
      sessionId: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      phq9Total: session.triageResult?.phq9Total ?? null,
      gad7Total: session.triageResult?.gad7Total ?? null,
      phq9Band: session.triageResult?.phq9Band ?? null,
      gad7Band: session.triageResult?.gad7Band ?? null,
      riskLevel: session.triageResult?.riskLevel ?? null
    })),
    serverTimeMs: Date.now() - start
  }
})
