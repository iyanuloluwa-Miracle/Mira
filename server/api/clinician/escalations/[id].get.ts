// [FR7][NFR1] One escalation's detail view. Free text is decrypted and shown only if the
// person's HUMAN_REVIEW consent is *currently* active — re-checked here, at read time, not
// inferred from the Escalation row's mere existence, so a withdrawal after this row was
// created immediately stops surfacing it (see server/domain/consent.ts's own comment on why
// creation-time and read-time are two separate checks). Never returns anything beyond a
// pseudonym — no userId, no email — matching the acceptance criterion that a clinician cannot
// see any identifier beyond it.

import { canRevealFreeTextToClinician } from '../../../domain/consent'
import { decryptField } from '../../../utils/crypto'

export default defineEventHandler(async (event) => {
  requireClinician(event)

  const id = getRouterParam(event, 'id')
  if (!id) badRequestError('An escalation id is required.')

  const escalation = await prisma.escalation.findUnique({
    where: { id },
    include: {
      triageResult: {
        include: {
          session: {
            include: {
              user: { select: { id: true, pseudonym: true } },
              freeTextEntries: { take: 1 }
            }
          }
        }
      }
    }
  })
  if (!escalation) notFoundError('Escalation not found.')

  const { triageResult } = escalation
  const { session } = triageResult
  const { user } = session

  const consentRecords = await prisma.consentRecord.findMany({
    where: { userId: user.id, purpose: 'HUMAN_REVIEW' },
    select: { purpose: true, granted: true, withdrawnAt: true }
  })
  const canRevealFreeText = canRevealFreeTextToClinician(consentRecords)

  const freeTextEntry = session.freeTextEntries[0]
  const freeText = !freeTextEntry
    ? { available: false as const, reason: 'not-submitted' as const }
    : !canRevealFreeText
      ? { available: false as const, reason: 'withheld-by-consent' as const }
      : {
          available: true as const,
          text: decryptField({
            ciphertext: Buffer.from(freeTextEntry.ciphertext),
            iv: Buffer.from(freeTextEntry.iv),
            authTag: Buffer.from(freeTextEntry.authTag)
          })
        }

  const notes =
    escalation.notesCiphertext && escalation.notesIv && escalation.notesAuthTag
      ? decryptField({
          ciphertext: Buffer.from(escalation.notesCiphertext),
          iv: Buffer.from(escalation.notesIv),
          authTag: Buffer.from(escalation.notesAuthTag)
        })
      : null

  return {
    id: escalation.id,
    status: escalation.status,
    createdAt: escalation.createdAt.toISOString(),
    acknowledgedAt: escalation.acknowledgedAt?.toISOString() ?? null,
    pseudonym: user.pseudonym,
    riskLevel: triageResult.riskLevel,
    phq9Total: triageResult.phq9Total,
    gad7Total: triageResult.gad7Total,
    phq9Band: triageResult.phq9Band,
    gad7Band: triageResult.gad7Band,
    rationale: triageResult.rationaleJson,
    freeText,
    notes
  }
})
