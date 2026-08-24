// [R4][R5][R6][R7][NFR1] The bounded conversational layer's one endpoint. Conversation
// continuity is client-side (the caller resends its own already-approved priorMessages each
// turn, the same way it holds its own chat state) — the server never needs to reconstruct a
// transcript from storage to keep a conversation going, which is what lets rule R5's "no
// transcript unless consented" hold without breaking multi-turn context.
//
// A ConversationTurn row is written for every call, whatever the outcome, so "turn count" is
// always answerable by counting rows — pre-filter and session-limit turns included, with a
// 'n/a' model sentinel and zero tokens since no LLM call happened. The encrypted transcript
// columns are only ever populated with what was actually shown back to the person (the real
// reply, or a fallback) — never a rejected/unsafe model output, even under research consent.

import { z } from 'zod'
import { getCrisisResponse } from '../../../domain/safety'
import {
  createLlmClient,
  handleConversationTurn,
  type ConversationTurnOutcome
} from '../../../services/conversation'
import { encryptField, toPrismaBytes } from '../../../utils/crypto'

const priorMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000)
})

const bodySchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    priorMessages: z.array(priorMessageSchema).max(20).default([])
  })
  .strict()

const NO_MODEL_CALL_SENTINEL = 'n/a'

export default defineEventHandler(async (event) => {
  const start = Date.now()
  const user = requireUser(event)

  const sessionId = getRouterParam(event, 'sessionId')
  if (!sessionId) badRequestError('A session id is required.')

  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: {
      triageResult: true,
      conversationTurns: { select: { promptTokens: true, completionTokens: true } }
    }
  })
  if (!session) notFoundError('Screening session not found.')
  if (session.userId !== user.id) forbiddenError('This screening session belongs to someone else.')
  if (!session.triageResult) {
    badRequestError('This screening session has not been completed yet.')
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) badRequestError('message (string, 1-2000 chars) is required.')
  const { message, priorMessages } = parsed.data

  const turnNumber = session.conversationTurns.length + 1
  const tokensUsedInSession = session.conversationTurns.reduce(
    (sum, turn) => sum + turn.promptTokens + turn.completionTokens,
    0
  )

  // [R6] The pre-filter runs first, unconditionally, inside handleConversationTurn — if it
  // fires, nothing below it (LLM construction included) ever runs for this call.
  const outcome = await handleConversationTurn(
    {
      userMessage: message,
      context: {
        riskLevel: session.triageResult.riskLevel,
        rationale: session.triageResult.rationaleJson as string[]
      },
      priorMessages: priorMessages.map((m) => ({ role: m.role, content: m.content })),
      tokensUsedInSession
    },
    createLlmClient()
  )

  const responseText = outcomeUserFacingText(outcome)
  await persistTurn(session.id, turnNumber, outcome, message, responseText, user.id)

  if (outcome.kind === 'pre-filter') {
    const crisis = getCrisisResponse()
    return {
      kind: 'crisis' as const,
      message: crisis.message,
      instruction: crisis.instruction,
      helplines: crisis.helplines,
      helplinesVerified: crisis.helplinesVerified,
      serverTimeMs: Date.now() - start
    }
  }

  return {
    kind:
      outcome.kind === 'ok'
        ? ('ok' as const)
        : (outcome.kind as 'session-limit' | 'llm-unavailable' | 'post-filter'),
    text: responseText,
    serverTimeMs: Date.now() - start
  }
})

function outcomeUserFacingText(outcome: ConversationTurnOutcome): string {
  switch (outcome.kind) {
    case 'ok':
      return outcome.text
    case 'session-limit':
    case 'llm-unavailable':
    case 'post-filter':
      return outcome.fallbackText
    case 'pre-filter':
      // Not used directly — the pre-filter branch returns the full crisis payload instead of
      // a plain text field. Present for exhaustiveness only.
      return ''
  }
}

async function persistTurn(
  sessionId: string,
  turnNumber: number,
  outcome: ConversationTurnOutcome,
  userMessage: string,
  responseText: string,
  userId: string
): Promise<void> {
  const hasModelCall = outcome.kind === 'ok' || outcome.kind === 'post-filter'

  const consent = await prisma.consentRecord.findFirst({
    where: { userId, purpose: 'RESEARCH_LOGGING', granted: true, withdrawnAt: null },
    orderBy: { grantedAt: 'desc' }
  })

  // [R5] Only ever the text actually shown to the person — never a rejected/unsafe model
  // output — and only when RESEARCH_LOGGING consent is currently active.
  const transcript = consent
    ? encryptField(JSON.stringify({ user: userMessage, assistant: responseText }))
    : null

  await prisma.conversationTurn.create({
    data: {
      sessionId,
      turnNumber,
      modelName: hasModelCall ? outcome.modelName : NO_MODEL_CALL_SENTINEL,
      modelVersion: hasModelCall ? outcome.modelVersion : NO_MODEL_CALL_SENTINEL,
      latencyMs: hasModelCall ? outcome.latencyMs : 0,
      promptTokens: hasModelCall ? outcome.promptTokens : 0,
      completionTokens: hasModelCall ? outcome.completionTokens : 0,
      preFilterTriggered: outcome.kind === 'pre-filter',
      preFilterReason: outcome.kind === 'pre-filter' ? outcome.reason : null,
      postFilterTriggered: outcome.kind === 'post-filter',
      postFilterReason: outcome.kind === 'post-filter' ? outcome.reason : null,
      ...(transcript
        ? {
            transcriptCiphertext: toPrismaBytes(transcript.ciphertext),
            transcriptIv: toPrismaBytes(transcript.iv),
            transcriptAuthTag: toPrismaBytes(transcript.authTag)
          }
        : {})
    }
  })

  // [FR7][R4] Both filter types get their own audit trail entry, with the reason but never the
  // content — matching the discipline server/api/screening/[id]/text.post.ts already applies.
  if (outcome.kind === 'pre-filter') {
    await writeAuditLog({
      actorType: 'USER',
      actorId: userId,
      action: 'CONVERSATION_PRE_FILTER_TRIGGERED',
      entityType: 'ScreeningSession',
      entityId: sessionId,
      metadata: { reason: outcome.reason }
    })
  } else if (outcome.kind === 'post-filter') {
    await writeAuditLog({
      actorType: 'USER',
      actorId: userId,
      action: 'CONVERSATION_POST_FILTER_TRIGGERED',
      entityType: 'ScreeningSession',
      entityId: sessionId,
      metadata: { reason: outcome.reason }
    })
  }
}
