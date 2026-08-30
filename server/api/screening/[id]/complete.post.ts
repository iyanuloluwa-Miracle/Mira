// [FR4][FR6][NFR3] Scores both instruments, runs computeTriage, and persists the result.
// serverLatencyMs on the session is this handler's own processing time — the NFR3 measurement
// the acceptance criteria asks for. Re-completing an already-completed session returns the
// existing result instead of erroring or recomputing, so a network retry can't create a
// duplicate TriageResult/Escalation/AuditLog.

import { z } from 'zod'
import type { TriageResult } from '@prisma/client'
import { mapClassifierResultToPrediction } from '../../../domain/classifier-risk-mapping'
import {
  IncompleteResponseError,
  InvalidResponseValueError,
  scoreGad7,
  scorePhq9
} from '../../../domain/scoring'
import { PHQ9_ITEM_NINE_CODE } from '../../../domain/instruments/phq9'
import { computeTriage } from '../../../domain/triage'
import {
  computeResourceRecommendations,
  determineDrivingInstrument,
  type RankedResource
} from '../../../domain/resources'
import { canCreateEscalationRecord } from '../../../domain/consent'
import type { ClassifierLabel } from '../../../domain/model-contract'
import { buildTextAnalysis, type TextAnalysis } from '../../../utils/text-analysis'
import { createNotificationService } from '../../../services/notification'

interface RecommendedResource {
  slug: string
  title: string
  readingTimeMinutes: number
}

// [FR5] Reads back the ResourceRecommendation rows persisted at completion time, rather than
// recomputing — recommendations, like the TriageResult itself, are decided once and then stay
// stable for that session, even if the resource catalogue changes later. Duplicated (not
// imported) in result.get.ts, matching this file's own buildResultPayload below, which is
// likewise a small per-file helper rather than a cross-route import.
async function loadRecommendedResources(triageResultId: string): Promise<RecommendedResource[]> {
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

const bodySchema = z.object({}).strict()

type LoadedSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>
type CompletedSession = LoadedSession & {
  triageResult: NonNullable<LoadedSession['triageResult']>
}

function loadSession(sessionId: string) {
  return prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: {
      triageResult: true,
      itemResponses: true,
      freeTextEntries: { take: 1 },
      modelPredictions: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  })
}

// [FR3][NFR5] Shared by the "already completed" early return below and by the race-recovery
// path in the transaction's catch block — both need to build the exact same payload from an
// already-completed session, just reached a different way.
async function buildCompletedResponse(
  session: CompletedSession,
  start: number
): Promise<ReturnType<typeof buildResultPayload>> {
  const textAnalysis = buildTextAnalysis({
    freeTextExcluded: session.freeTextExcluded,
    freeTextEntries: session.freeTextEntries,
    modelPredictions: session.modelPredictions,
    riskLevel: session.triageResult.riskLevel
  })
  const resources = await loadRecommendedResources(session.triageResult.id)
  const existingEscalation = await prisma.escalation.findUnique({
    where: { triageResultId: session.triageResult.id },
    select: { id: true }
  })
  return buildResultPayload(
    session.triageResult,
    textAnalysis,
    resources,
    !!existingEscalation,
    start
  )
}

export default defineEventHandler(async (event) => {
  const start = Date.now()
  const user = requireUser(event)

  const parsedParam = uuidParamSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsedParam.success) badRequestError('A valid session id is required.')
  const sessionId = parsedParam.data

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const rateLimit = screeningSubmissionRateLimiter.consume(hashIdentifier(ip))
  if (!rateLimit.allowed) tooManyRequestsError()

  const body = (await readBody(event).catch(() => undefined)) ?? {}
  const parsedBody = bodySchema.safeParse(body)
  if (!parsedBody.success) badRequestError('This endpoint does not accept a request body.')
  if (!emptyQuerySchema.safeParse(getQuery(event)).success) {
    badRequestError('This endpoint does not accept a query string.')
  }

  const session = await loadSession(sessionId)
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')

  // [FR3][NFR5] riskLevel is already known here (this session was completed before) — safe to
  // build textAnalysis against the real value, unlike the fresh-completion path below where it
  // isn't decided until computeTriage runs.
  if (session.status === 'COMPLETED' && session.triageResult) {
    return buildCompletedResponse(session as CompletedSession, start)
  }
  if (session.status !== 'IN_PROGRESS') {
    badRequestError('This screening session can no longer be completed.')
  }

  const responses: Record<string, number> = {}
  for (const response of session.itemResponses) {
    responses[response.itemCode] = response.rawValue
  }

  let phq9Result: ReturnType<typeof scorePhq9>
  let gad7Result: ReturnType<typeof scoreGad7>
  try {
    phq9Result = scorePhq9(responses)
    gad7Result = scoreGad7(responses)
  } catch (error) {
    if (error instanceof IncompleteResponseError || error instanceof InvalidResponseValueError) {
      badRequestError(error.message)
    }
    throw error
  }

  // [FR3][R1] At most one prediction per session in practice (the free-text step is one-shot —
  // server/api/screening/[id]/text.post.ts), but modelPredictions is ordered/limited above
  // defensively rather than assumed. Absent entirely whenever free text wasn't submitted, was
  // excluded, or the classifier was unavailable at submission time — computeTriage already
  // treats a missing modelPrediction as "no adjustment," so no branching is needed here beyond
  // the lookup itself.
  const latestPrediction = session.modelPredictions[0]
  const modelPrediction = latestPrediction
    ? mapClassifierResultToPrediction({
        predictedLabel: latestPrediction.predictedLabel as ClassifierLabel,
        probability: latestPrediction.probability
      })
    : undefined

  const triage = computeTriage({
    phq9: phq9Result.total,
    gad7: gad7Result.total,
    itemNineValue: responses[PHQ9_ITEM_NINE_CODE]!,
    modelPrediction
  })

  const completedAt = new Date()
  const serverLatencyMs = Date.now() - start

  // [FR6][NFR1] The consent-aware escalation branch (server/domain/consent.ts): an
  // escalate-worthy result only becomes an identifiable Escalation row a clinician can see if
  // HUMAN_REVIEW consent is already active. If not, escalated stays true on the TriageResult
  // (it's a fact about the result, not consent-gated) and the person still sees the referral
  // screen and helplines client-side (result.get.ts, app/pages/result/[sessionId].vue) — they
  // can also opt in after the fact from that screen, via
  // server/api/screening/[id]/escalate.post.ts, which is the other place this same check runs.
  const consentRecords = triage.escalate
    ? await prisma.consentRecord.findMany({
        where: { userId: user.id, purpose: 'HUMAN_REVIEW' },
        select: { purpose: true, granted: true, withdrawnAt: true }
      })
    : []
  const shouldEscalate = triage.escalate && canCreateEscalationRecord(consentRecords)

  let transactionResult: {
    triageResult: TriageResult
    recommendedResources: RecommendedResource[]
    escalation: Awaited<ReturnType<typeof prisma.escalation.create>> | null
  }
  try {
    transactionResult = await prisma.$transaction(
      async (tx) => {
        const created = await tx.triageResult.create({
          data: {
            sessionId: session.id,
            phq9Total: phq9Result.total,
            gad7Total: gad7Result.total,
            phq9Band: phq9Result.band,
            gad7Band: gad7Result.band,
            riskLevel: triage.riskLevel,
            rationaleJson: triage.rationale,
            escalated: triage.escalate
          }
        })

        await tx.screeningSession.update({
          where: { id: session.id },
          data: { status: 'COMPLETED', completedAt, serverLatencyMs }
        })

        const escalation = shouldEscalate
          ? await tx.escalation.create({
              data: { triageResultId: created.id, status: 'PENDING' }
            })
          : null

        // [FR5] Recommendations are decided once, here, alongside the triage result they're
        // derived from, and never recomputed later — see loadRecommendedResources above.
        const candidates = await tx.resource.findMany({
          where: { isActive: true },
          select: {
            id: true,
            slug: true,
            title: true,
            tags: true,
            minRisk: true,
            maxRisk: true,
            readingTimeMinutes: true,
            isActive: true
          }
        })
        const drivingInstrument = determineDrivingInstrument(phq9Result.band, gad7Result.band)
        const ranked: RankedResource[] = computeResourceRecommendations(
          candidates,
          triage.riskLevel,
          drivingInstrument
        )
        if (ranked.length > 0) {
          await tx.resourceRecommendation.createMany({
            data: ranked.map((resource) => ({
              triageResultId: created.id,
              resourceId: resource.resourceId,
              rank: resource.rank
            }))
          })
        }

        return {
          triageResult: created,
          escalation,
          recommendedResources: ranked.map((resource): RecommendedResource => ({
            slug: resource.slug,
            title: resource.title,
            readingTimeMinutes: resource.readingTimeMinutes
          }))
        }
      },
      // [NFR4] This transaction now does real work end to end (triage, an optional Escalation
      // row, a resource query, and ranked ResourceRecommendation rows) against Neon's real,
      // variable cross-region latency — Prisma's 5s default interactive-transaction timeout was
      // observed failing a real completion under e2e load with P2028 ("transaction not found",
      // Neon having recycled the connection before the transaction finished). A slow-but-honest
      // completion must not fail outright for someone who may be in crisis.
      { timeout: 15_000, maxWait: 10_000 }
    )
  } catch (error) {
    // [NFR4] Two concurrent completion requests for the same session can both pass the
    // status === 'IN_PROGRESS' check above before either commits — confirmed happening for
    // real, not theoretical (a genuine P2002 surfaced in production log output during this
    // prompt's own verification pass). The loser's triageResult.create() fails on
    // TriageResult.sessionId's unique constraint; rather than that surfacing to its caller as a
    // generic 500, it re-reads the now-committed winner's result and returns the exact same
    // successful response the "already completed" branch above returns — a race, resolved the
    // same way a retry would have resolved it, without ever appearing as a failure.
    if (isUniqueConstraintViolationOn(error, 'sessionId')) {
      const completed = await loadSession(sessionId)
      if (completed?.status === 'COMPLETED' && completed.triageResult) {
        return buildCompletedResponse(completed as CompletedSession, start)
      }
    }
    throw error
  }

  const { triageResult, recommendedResources, escalation } = transactionResult

  // [FR7][R4] Every completion is audited — this also satisfies "any request touching a
  // CRISIS result writes an AuditLog entry" for this endpoint, since it logs unconditionally.
  await writeAuditLog({
    actorType: 'USER',
    actorId: user.id,
    action: 'SCREENING_COMPLETED',
    entityType: 'ScreeningSession',
    entityId: session.id,
    metadata: {
      riskLevel: triage.riskLevel,
      escalated: triage.escalate,
      escalationRecorded: !!escalation
    }
  })

  // [FR6] Best-effort — see ConsoleNotificationService, which never lets a failure here
  // propagate and turn into a failed screening completion (rule R7).
  if (escalation) {
    await createNotificationService().notifyEscalation({
      escalationId: escalation.id,
      riskLevel: triage.riskLevel,
      pseudonym: user.pseudonym,
      createdAt: escalation.createdAt
    })
  }

  // [FR3][NFR5] Now that riskLevel is finally decided, safe to build — this is what keeps a
  // CRISIS result from ever getting real spans computed against it, even transiently.
  const textAnalysis = buildTextAnalysis({
    freeTextExcluded: session.freeTextExcluded,
    freeTextEntries: session.freeTextEntries,
    modelPredictions: session.modelPredictions,
    riskLevel: triage.riskLevel
  })

  // [NFR3] Only on a real completion (never the "already completed" early return above) — that
  // path is a cache-read, not a fresh measurement of how long completion actually took.
  // Awaited (recordMetric itself never throws) rather than fire-and-forget: this is thesis
  // evidence, and a detached write racing an early process exit is a real way to silently lose
  // a row.
  await recordMetric({
    name: 'screening_complete_server_ms',
    valueMs: serverLatencyMs,
    sessionId: session.id
  })

  return buildResultPayload(triageResult, textAnalysis, recommendedResources, !!escalation, start)
})

function buildResultPayload(
  triageResult: TriageResult,
  textAnalysis: TextAnalysis,
  resources: RecommendedResource[],
  escalationRecorded: boolean,
  start: number
) {
  return {
    sessionId: triageResult.sessionId,
    phq9Total: triageResult.phq9Total,
    gad7Total: triageResult.gad7Total,
    phq9Band: triageResult.phq9Band,
    gad7Band: triageResult.gad7Band,
    riskLevel: triageResult.riskLevel,
    rationale: triageResult.rationaleJson,
    escalated: triageResult.escalated,
    escalationRecorded,
    textAnalysis,
    resources,
    serverTimeMs: Date.now() - start
  }
}
