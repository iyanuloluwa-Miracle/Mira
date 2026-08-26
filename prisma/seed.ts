// Populates non-participant fixture/demo data only (rule R10). Never seed real
// participant records, even for local development.
//
// [FR7] Seeds one admin clinician account so the clinician review interface has something to
// log into locally. [FR5] Seeds the psychoeducational resource library from content/resources/
// (prisma/resource-content.ts parses and validates the front matter) — content/resources/ is
// the authored source of truth, Postgres is what the app actually reads from at request time.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { loadResourceContent } from './resource-content'

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

  const resources = loadResourceContent()
  const unverifiedSlugs: string[] = []

  for (const resource of resources) {
    await prisma.resource.upsert({
      where: { slug: resource.slug },
      update: {
        title: resource.title,
        body: resource.body,
        language: resource.language,
        tags: resource.tags,
        minRisk: resource.minRisk,
        maxRisk: resource.maxRisk,
        readingTimeMinutes: resource.readingTimeMinutes,
        sourceAttribution: resource.sourceAttribution,
        isActive: true
      },
      create: {
        title: resource.title,
        slug: resource.slug,
        body: resource.body,
        language: resource.language,
        tags: resource.tags,
        minRisk: resource.minRisk,
        maxRisk: resource.maxRisk,
        readingTimeMinutes: resource.readingTimeMinutes,
        sourceAttribution: resource.sourceAttribution,
        isActive: true
      }
    })
    if (resource.sourceAttribution.startsWith('TODO_VERIFY')) unverifiedSlugs.push(resource.slug)
  }
  console.log(`Seeded ${resources.length} resources`)

  // [R10] Printed at the exact point content enters the system, mirroring
  // server/plugins/warn-unverified-resource-sources.ts's server-boot warning — a human running
  // this command is the right moment to notice a citation is still pending.
  if (unverifiedSlugs.length > 0) {
    console.warn(
      `${unverifiedSlugs.length} resource(s) still have a TODO_VERIFY sourceAttribution — do ` +
        `not treat their content as citing a real source until it has been personally verified ` +
        `(rule R10): ${unverifiedSlugs.join(', ')}`
    )
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
