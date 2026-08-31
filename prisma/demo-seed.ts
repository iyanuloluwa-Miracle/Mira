// [R10] Populates six deterministic, synthetic walkthrough scenarios on top of the base seed
// (prisma/seed.ts — run this only after that one, e.g. via `npm run demo`, which runs
// `prisma migrate reset` — that reset triggers the configured base seed automatically — and
// then this script). Every id below is a fixed, obviously-fake UUID (not @default(uuid())) so
// re-running this script always reproduces the exact same rows — a screenshot taken today
// matches one taken next month structurally, even though relative "N days ago" timestamps are
// computed from the current time at each run rather than frozen. Every pseudonym, free-text
// entry, and email is deliberately unreal on inspection. Reuses the same pure domain functions
// the real API routes use (scoring.ts, triage.ts, consent.ts) and the same encryption helper
// (crypto.ts) rather than hand-rolling equivalent logic, so seeded rows are shaped exactly like
// ones the app itself would have produced.
//
// hashSessionToken is reimplemented here rather than imported from server/utils/auth.ts, for the
// same reason prisma/seed.ts reimplements hashPassword instead of importing it: that module also
// references Nitro-only globals (prisma, unauthorizedError, H3Event cookie helpers) that this
// plain tsx script's own tsconfig (tsconfig.scripts.json) doesn't have type declarations for.

import { createHmac, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { encryptField, toPrismaBytes } from '../server/utils/crypto'
import { GAD7_ITEMS, type Gad7ItemCode } from '../server/domain/instruments/gad7'
import {
  PHQ9_ITEM_NINE_CODE,
  PHQ9_ITEMS,
  type Phq9ItemCode
} from '../server/domain/instruments/phq9'
import { scoreGad7, scorePhq9 } from '../server/domain/scoring'
import { computeTriage } from '../server/domain/triage'
import { HUMAN_REVIEW_CONSENT_VERSION } from '../server/domain/consent'
import { DEMO_IDS } from './demo-seed-ids'

const prisma = new PrismaClient()

const ADMIN_CLINICIAN_EMAIL = 'admin@mira.local'
const SESSION_TOKENS_PATH = join(process.cwd(), 'scripts', '.demo-session-tokens.json')

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function toResponseRecord<Code extends string>(
  items: readonly { itemCode: Code }[],
  values: number[]
): Record<Code, number> {
  const record = {} as Record<Code, number>
  items.forEach((item, index) => {
    record[item.itemCode] = values[index]!
  })
  return record
}

function hashSessionToken(token: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set — run "npm run setup" first.')
  return createHmac('sha256', secret).update(token).digest('hex')
}

interface AnsweredSession {
  userId: string
  sessionId: string
  triageResultId: string
  phq9Values: number[]
  gad7Values: number[]
  startedAt: Date
  freeText?: string
}

// [FR2][FR4][R2] Scores and triages exactly the way server/api/screening/[id]/complete.post.ts
// does, then persists a User/ScreeningSession/ItemResponse[]/TriageResult set matching what a
// real completion would have produced — the only difference is that ids are fixed, not
// @default(uuid()), for reproducibility.
async function seedAnsweredSession(
  pseudonym: string,
  input: AnsweredSession
): Promise<{ riskLevel: string; escalate: boolean }> {
  await prisma.user.upsert({
    where: { id: input.userId },
    update: {},
    create: { id: input.userId, pseudonym, authMode: 'ANONYMOUS', createdAt: input.startedAt }
  })

  const phq9Responses = toResponseRecord<Phq9ItemCode>(PHQ9_ITEMS, input.phq9Values)
  const gad7Responses = toResponseRecord<Gad7ItemCode>(GAD7_ITEMS, input.gad7Values)
  const phq9Result = scorePhq9(phq9Responses)
  const gad7Result = scoreGad7(gad7Responses)
  const triage = computeTriage({
    phq9: phq9Result.total,
    gad7: gad7Result.total,
    itemNineValue: phq9Responses[PHQ9_ITEM_NINE_CODE]
  })

  const completedAt = new Date(input.startedAt.getTime() + 4 * 60 * 1000)

  await prisma.screeningSession.upsert({
    where: { id: input.sessionId },
    update: {},
    create: {
      id: input.sessionId,
      userId: input.userId,
      instrument: 'COMBINED',
      status: 'COMPLETED',
      startedAt: input.startedAt,
      completedAt,
      serverLatencyMs: 180,
      freeTextExcluded: input.freeText === undefined
    }
  })

  for (const [items, values] of [
    [PHQ9_ITEMS, input.phq9Values],
    [GAD7_ITEMS, input.gad7Values]
  ] as const) {
    for (let index = 0; index < items.length; index++) {
      const itemCode = items[index]!.itemCode
      await prisma.itemResponse.upsert({
        where: { sessionId_itemCode: { sessionId: input.sessionId, itemCode } },
        update: { rawValue: values[index]! },
        create: {
          sessionId: input.sessionId,
          itemCode,
          rawValue: values[index]!,
          answeredAt: input.startedAt
        }
      })
    }
  }

  if (input.freeText) {
    const encrypted = encryptField(input.freeText)
    await prisma.freeTextEntry.deleteMany({ where: { sessionId: input.sessionId } })
    await prisma.freeTextEntry.create({
      data: {
        sessionId: input.sessionId,
        ciphertext: toPrismaBytes(encrypted.ciphertext),
        iv: toPrismaBytes(encrypted.iv),
        authTag: toPrismaBytes(encrypted.authTag),
        charCount: input.freeText.length,
        createdAt: input.startedAt
      }
    })
  }

  await prisma.triageResult.upsert({
    where: { id: input.triageResultId },
    update: {},
    create: {
      id: input.triageResultId,
      sessionId: input.sessionId,
      phq9Total: phq9Result.total,
      gad7Total: gad7Result.total,
      phq9Band: phq9Result.band,
      gad7Band: gad7Result.band,
      riskLevel: triage.riskLevel,
      rationaleJson: triage.rationale,
      escalated: triage.escalate,
      createdAt: completedAt
    }
  })

  return { riskLevel: triage.riskLevel, escalate: triage.escalate }
}

async function grantHumanReviewConsent(userId: string, grantedAt: Date): Promise<void> {
  await prisma.consentRecord.deleteMany({ where: { userId, purpose: 'HUMAN_REVIEW' } })
  await prisma.consentRecord.create({
    data: {
      userId,
      purpose: 'HUMAN_REVIEW',
      consentVersion: HUMAN_REVIEW_CONSENT_VERSION,
      granted: true,
      grantedAt
    }
  })
}

async function seedEscalation(
  escalationId: string,
  triageResultId: string,
  status: 'PENDING' | 'ACKNOWLEDGED',
  createdAt: Date,
  clinicianId?: string
): Promise<void> {
  await prisma.escalation.upsert({
    where: { id: escalationId },
    update: {},
    create: {
      id: escalationId,
      triageResultId,
      status,
      clinicianId: status === 'ACKNOWLEDGED' ? clinicianId : undefined,
      acknowledgedAt: status === 'ACKNOWLEDGED' ? new Date(createdAt.getTime() + 60 * 1000) : null,
      createdAt
    }
  })
}

async function main(): Promise<void> {
  const adminClinician = await prisma.clinician.findUnique({
    where: { email: ADMIN_CLINICIAN_EMAIL }
  })
  if (!adminClinician) {
    throw new Error(
      `No clinician found at ${ADMIN_CLINICIAN_EMAIL} — run "npm run db:seed" (the base seed) ` +
        'before this script. "npm run demo" already does this for you via `prisma migrate reset`.'
    )
  }

  // Scenario 1: minimal-risk completed session.
  await seedAnsweredSession('demo-minimal', {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '11111111-1111-4111-8111-111111111112',
    triageResultId: '11111111-1111-4111-8111-111111111113',
    phq9Values: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    gad7Values: [0, 0, 0, 0, 0, 0, 0],
    startedAt: daysAgo(2)
  })
  console.log('Seeded scenario 1: minimal-risk session (demo-minimal)')

  // Scenario 2: moderate session — phq9 total 16 lands in triage's 15-19 MODERATE band.
  await seedAnsweredSession('demo-moderate', {
    userId: '22222222-2222-4222-8222-222222222221',
    sessionId: '22222222-2222-4222-8222-222222222222',
    triageResultId: '22222222-2222-4222-8222-222222222223',
    phq9Values: [2, 2, 2, 2, 2, 2, 2, 2, 0],
    gad7Values: [1, 1, 1, 1, 1, 1, 1],
    startedAt: daysAgo(1),
    freeText:
      'Synthetic demo response for MVP1 evaluation only: things have felt heavier than usual lately.'
  })
  console.log('Seeded scenario 2: moderate session (demo-moderate)')

  // Scenario 3: high-risk, escalated — phq9 total 24 is above the HIGH threshold (>=20).
  const { escalate: highEscalate } = await seedAnsweredSession('demo-high-escalated', {
    userId: DEMO_IDS.highEscalated.userId,
    sessionId: DEMO_IDS.highEscalated.sessionId,
    triageResultId: DEMO_IDS.highEscalated.triageResultId,
    phq9Values: [3, 3, 3, 3, 3, 3, 3, 3, 0],
    gad7Values: [2, 2, 2, 2, 2, 2, 2],
    startedAt: daysAgo(1),
    freeText:
      'Synthetic demo response for MVP1 evaluation only: I feel exhausted and overwhelmed most days.'
  })
  if (!highEscalate) throw new Error('Expected scenario 3 to be escalate-worthy (HIGH).')
  await grantHumanReviewConsent(DEMO_IDS.highEscalated.userId, daysAgo(1))
  await seedEscalation(
    DEMO_IDS.highEscalated.escalationId,
    DEMO_IDS.highEscalated.triageResultId,
    'PENDING',
    daysAgo(1)
  )
  console.log('Seeded scenario 3: high-risk escalated session (demo-high-escalated), PENDING')

  // Scenario 4: PHQ-9 item 9 above zero forces CRISIS unconditionally (rule R2), regardless of
  // the other item values chosen here.
  const { riskLevel: crisisRisk } = await seedAnsweredSession('demo-crisis', {
    userId: DEMO_IDS.crisis.userId,
    sessionId: DEMO_IDS.crisis.sessionId,
    triageResultId: DEMO_IDS.crisis.triageResultId,
    phq9Values: [2, 2, 2, 2, 2, 2, 2, 2, 2],
    gad7Values: [1, 1, 1, 1, 1, 1, 1],
    startedAt: daysAgo(0)
  })
  if (crisisRisk !== 'CRISIS') throw new Error('Expected scenario 4 to be CRISIS.')
  await grantHumanReviewConsent(DEMO_IDS.crisis.userId, daysAgo(0))
  await seedEscalation(
    DEMO_IDS.crisis.escalationId,
    DEMO_IDS.crisis.triageResultId,
    'PENDING',
    daysAgo(0)
  )
  console.log('Seeded scenario 4: item-9 crisis session (demo-crisis), PENDING')

  // Scenario 5: a second HIGH escalation, already reviewed — gives the clinician queue and
  // detail view a real status mix (PENDING x2, ACKNOWLEDGED x1) rather than one flat list.
  await seedAnsweredSession('demo-high-reviewed', {
    userId: DEMO_IDS.highReviewed.userId,
    sessionId: DEMO_IDS.highReviewed.sessionId,
    triageResultId: DEMO_IDS.highReviewed.triageResultId,
    phq9Values: [3, 3, 3, 3, 3, 2, 2, 2, 0],
    gad7Values: [2, 2, 2, 1, 1, 1, 1],
    startedAt: daysAgo(3)
  })
  await grantHumanReviewConsent(DEMO_IDS.highReviewed.userId, daysAgo(3))
  await seedEscalation(
    DEMO_IDS.highReviewed.escalationId,
    DEMO_IDS.highReviewed.triageResultId,
    'ACKNOWLEDGED',
    daysAgo(3),
    adminClinician.id
  )
  console.log('Seeded scenario 5: already-reviewed high-risk escalation (demo-high-reviewed)')

  // Scenario 6: one user with three completed sessions spanning risk bands, for the /history
  // screen. A raw session token is minted and its hash stored exactly as
  // server/utils/auth.ts's real login flow would, then the raw token is written to a local,
  // gitignored file so scripts/capture-evidence.ts can present as this user without a real
  // login flow existing for anonymous accounts.
  const historyUserId = '66666666-6666-4666-8666-666666666661'
  await seedAnsweredSession('demo-history', {
    userId: historyUserId,
    sessionId: '66666666-6666-4666-8666-666666666662',
    triageResultId: '66666666-6666-4666-8666-666666666663',
    phq9Values: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    gad7Values: [0, 0, 0, 0, 0, 0, 0],
    startedAt: daysAgo(10)
  })
  await seedAnsweredSession('demo-history', {
    userId: historyUserId,
    sessionId: '66666666-6666-4666-8666-666666666664',
    triageResultId: '66666666-6666-4666-8666-666666666665',
    phq9Values: [2, 2, 2, 2, 1, 1, 1, 1, 0],
    gad7Values: [0, 0, 0, 0, 0, 0, 0],
    startedAt: daysAgo(5)
  })
  await seedAnsweredSession('demo-history', {
    userId: historyUserId,
    sessionId: '66666666-6666-4666-8666-666666666666',
    triageResultId: '66666666-6666-4666-8666-666666666667',
    phq9Values: [2, 2, 2, 2, 2, 2, 2, 2, 0],
    gad7Values: [1, 1, 1, 1, 1, 1, 1],
    startedAt: daysAgo(1)
  })

  const rawToken = randomBytes(32).toString('base64url')
  await prisma.session.deleteMany({ where: { userId: historyUserId } })
  await prisma.session.create({
    data: {
      userId: historyUserId,
      tokenHash: hashSessionToken(rawToken),
      expiresAt: daysAgo(-30) // 30 days in the future
    }
  })
  writeFileSync(
    SESSION_TOKENS_PATH,
    JSON.stringify({ historyUser: { cookieValue: rawToken } }, null, 2)
  )
  console.log(
    `Seeded scenario 6: user with 3-session history (demo-history), cookie token written to ` +
      `${SESSION_TOKENS_PATH}`
  )

  console.log('\nDemo seed complete.')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
