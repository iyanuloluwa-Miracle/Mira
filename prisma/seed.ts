// Populates non-participant fixture/demo data only (rule R10). Never seed real
// participant records, even for local development.
//
// [FR7] Seeds one admin clinician account so the clinician review interface has something to
// log into locally. [FR5] Seeds the psychoeducational resource library from content/resources/
// (prisma/resource-content.ts parses and validates the front matter) — content/resources/ is
// the authored source of truth, Postgres is what the app actually reads from at request time.

import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'
import { loadResourceContent } from './resource-content'

const prisma = new PrismaClient()

// Real argon2id hashing, same call server/utils/auth.ts's hashPassword() makes — not imported
// from there directly, since that module also references Nitro-only globals (prisma,
// unauthorizedError, H3Event cookie helpers) that this plain tsx script's own tsconfig
// (tsconfig.scripts.json) doesn't have type declarations for.
async function hashPasswordForSeed(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

async function main() {
  // update refreshes passwordHash too, not just an empty {} — otherwise a re-seed after
  // changing the hashing scheme (as happened moving off the old scrypt placeholder) would
  // silently leave an already-existing row's hash on the old scheme forever.
  const adminPasswordHash = await hashPasswordForSeed('change-me-before-any-real-use')
  const clinician = await prisma.clinician.upsert({
    where: { email: 'admin@mira.local' },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: 'admin@mira.local',
      passwordHash: adminPasswordHash,
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
