// Populates non-participant fixture/demo data only (rule R10). Never seed real
// participant records, even for local development.
//
// [FR7] Seeds one admin clinician account so the clinician review interface has something to
// log into locally. [FR5] Seeds ten placeholder psychoeducational resources spanning the risk
// spectrum so triage recommendation logic (server/domain/resources.ts) has real rows to map
// against — the body copy here is a placeholder, not reviewed clinical content; prompt 14
// replaces it with the real, clinician-reviewed article set.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { PrismaClient, RiskLevel } from '@prisma/client'

const prisma = new PrismaClient()

// Placeholder-strength password hashing for seed data only. server/utils/crypto.ts (rule R5)
// will implement real argon2id hashing for the auth flow (prompt 4); switch this over to that
// helper once it exists so there is exactly one password-hashing implementation in the repo.
function hashPasswordForSeed(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`
}

// Exported so a future auth implementation's tests can confirm this seed format verifies
// correctly before it is replaced — not used by the seed run itself.
export function verifySeedPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(':')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const resources: Array<{
  title: string
  slug: string
  tags: string[]
  minRisk: RiskLevel
  maxRisk: RiskLevel
}> = [
  {
    title: 'Understanding Low Mood',
    slug: 'understanding-low-mood',
    tags: ['depression', 'psychoeducation'],
    minRisk: RiskLevel.MINIMAL,
    maxRisk: RiskLevel.MODERATE
  },
  {
    title: 'Understanding Anxiety',
    slug: 'understanding-anxiety',
    tags: ['anxiety', 'psychoeducation'],
    minRisk: RiskLevel.MINIMAL,
    maxRisk: RiskLevel.MODERATE
  },
  {
    title: 'Sleep and Mental Health',
    slug: 'sleep-and-mental-health',
    tags: ['sleep', 'self-care'],
    minRisk: RiskLevel.MINIMAL,
    maxRisk: RiskLevel.MODERATE
  },
  {
    title: 'What Your Screening Score Means',
    slug: 'what-your-score-means',
    tags: ['screening', 'explanation'],
    minRisk: RiskLevel.MINIMAL,
    maxRisk: RiskLevel.HIGH
  },
  {
    title: 'Talking to Family About Mental Health',
    slug: 'talking-to-family',
    tags: ['support', 'communication'],
    minRisk: RiskLevel.MILD,
    maxRisk: RiskLevel.HIGH
  },
  {
    title: 'What to Expect From a First Appointment',
    slug: 'first-appointment',
    tags: ['help-seeking', 'clinician'],
    minRisk: RiskLevel.MODERATE,
    maxRisk: RiskLevel.HIGH
  },
  {
    title: 'Finding Help in Nigeria',
    slug: 'finding-help-in-nigeria',
    tags: ['help-seeking', 'resources'],
    minRisk: RiskLevel.MODERATE,
    maxRisk: RiskLevel.CRISIS
  },
  {
    title: 'Grounding and Breathing Techniques',
    slug: 'grounding-and-breathing',
    tags: ['coping', 'anxiety'],
    minRisk: RiskLevel.MILD,
    maxRisk: RiskLevel.HIGH
  },
  {
    title: 'When to Seek Urgent Help',
    slug: 'when-to-seek-urgent-help',
    tags: ['crisis', 'safety'],
    minRisk: RiskLevel.HIGH,
    maxRisk: RiskLevel.CRISIS
  },
  {
    title: 'Building a Daily Routine',
    slug: 'building-a-daily-routine',
    tags: ['self-care', 'depression'],
    minRisk: RiskLevel.MINIMAL,
    maxRisk: RiskLevel.MODERATE
  }
]

async function main() {
  const clinician = await prisma.clinician.upsert({
    where: { email: 'admin@mira.local' },
    update: {},
    create: {
      email: 'admin@mira.local',
      passwordHash: hashPasswordForSeed('change-me-before-any-real-use'),
      fullName: 'Mira Admin',
      role: 'ADMIN',
      isActive: true
    }
  })
  console.log(`Seeded admin clinician: ${clinician.email}`)

  for (const resource of resources) {
    await prisma.resource.upsert({
      where: { slug: resource.slug },
      update: {},
      create: {
        title: resource.title,
        slug: resource.slug,
        body: `# ${resource.title}\n\nPlaceholder content pending clinical review — see prompt 14 / CONTRIBUTING.md.`,
        language: 'en',
        tags: resource.tags,
        minRisk: resource.minRisk,
        maxRisk: resource.maxRisk,
        isActive: true
      }
    })
  }
  console.log(`Seeded ${resources.length} resources`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
