// [FR7][R4] Status transitions and clinician notes on one escalation. Status only ever moves
// forward through PENDING -> ACKNOWLEDGED -> CONTACTED -> CLOSED — skipping a step is allowed
// (a case can go straight to CLOSED if it turns out to need no follow-up), moving backward is
// not. Every transition writes an AuditLog entry with the acting clinician's id, satisfying the
// "every action audited" acceptance criterion; a notes update writes its own entry too, with
// the note content itself never in the metadata (rule R4 — metadataJson must never carry PHI).

import { z } from 'zod'
import { encryptField, toPrismaBytes } from '../../../utils/crypto'

const STATUS_ORDER = ['PENDING', 'ACKNOWLEDGED', 'CONTACTED', 'CLOSED'] as const

const bodySchema = z
  .object({
    status: z.enum(STATUS_ORDER).optional(),
    notes: z.string().min(1).max(10_000).optional()
  })
  .strict()
  .refine((data) => data.status !== undefined || data.notes !== undefined, {
    message: 'At least one of status or notes is required.'
  })

export default defineEventHandler(async (event) => {
  const clinician = requireClinician(event)

  const id = getRouterParam(event, 'id')
  if (!id) badRequestError('An escalation id is required.')

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) badRequestError('A valid status and/or notes field is required.')
  const { status, notes } = parsed.data

  const escalation = await prisma.escalation.findUnique({ where: { id } })
  if (!escalation) notFoundError('Escalation not found.')

  const updateData: Parameters<typeof prisma.escalation.update>[0]['data'] = {
    clinicianId: clinician.id
  }

  if (status) {
    const currentIndex = STATUS_ORDER.indexOf(escalation.status)
    const nextIndex = STATUS_ORDER.indexOf(status)
    if (nextIndex <= currentIndex) {
      badRequestError(`Status can only move forward: ${escalation.status} cannot become ${status}.`)
    }
    updateData.status = status
    if (status === 'ACKNOWLEDGED' && !escalation.acknowledgedAt) {
      updateData.acknowledgedAt = new Date()
    }
  }

  if (notes) {
    const encrypted = encryptField(notes)
    updateData.notesCiphertext = toPrismaBytes(encrypted.ciphertext)
    updateData.notesIv = toPrismaBytes(encrypted.iv)
    updateData.notesAuthTag = toPrismaBytes(encrypted.authTag)
  }

  await prisma.escalation.update({ where: { id }, data: updateData })

  if (status) {
    await writeAuditLog({
      actorType: 'CLINICIAN',
      actorId: clinician.id,
      action: 'ESCALATION_STATUS_CHANGED',
      entityType: 'Escalation',
      entityId: id,
      metadata: { fromStatus: escalation.status, toStatus: status }
    })
  }
  if (notes) {
    await writeAuditLog({
      actorType: 'CLINICIAN',
      actorId: clinician.id,
      action: 'ESCALATION_NOTE_UPDATED',
      entityType: 'Escalation',
      entityId: id
    })
  }

  return { status: status ?? escalation.status }
})
