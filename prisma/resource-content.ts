// [FR5] Reads and validates content/resources/*.md so prisma/seed.ts can upsert them into
// Postgres. Front-matter parsing (gray-matter) is a devDependency — this module only ever runs
// at seed time via `tsx`, never inside the deployed Nitro server, so it does not affect the
// app's runtime bundle.

import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { z } from 'zod'

const RISK_LEVELS = ['MINIMAL', 'MILD', 'MODERATE', 'HIGH', 'CRISIS'] as const
const RISK_LEVEL_ORDER = new Map(RISK_LEVELS.map((level, index) => [level, index]))

const frontMatterSchema = z
  .object({
    title: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
    tags: z.array(z.string().min(1)).min(1),
    minRisk: z.enum(RISK_LEVELS),
    maxRisk: z.enum(RISK_LEVELS),
    readingTimeMinutes: z.number().int().positive(),
    language: z.string().min(2),
    sourceAttribution: z.string().min(1)
  })
  .refine((data) => RISK_LEVEL_ORDER.get(data.minRisk)! <= RISK_LEVEL_ORDER.get(data.maxRisk)!, {
    message: 'minRisk must not be more severe than maxRisk',
    path: ['minRisk']
  })

export interface ParsedResource {
  title: string
  slug: string
  tags: string[]
  minRisk: (typeof RISK_LEVELS)[number]
  maxRisk: (typeof RISK_LEVELS)[number]
  readingTimeMinutes: number
  language: string
  sourceAttribution: string
  body: string
}

const CONTENT_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'content', 'resources')

// [R10] Throws rather than silently skipping a malformed file — a bad front-matter field
// (an invalid risk level, a missing sourceAttribution) should fail the seed run loudly, not
// quietly ship a resource nobody reviewed the shape of.
export function loadResourceContent(): ParsedResource[] {
  const files = readdirSync(CONTENT_DIR).filter(
    (file) => file.endsWith('.md') && file.toLowerCase() !== 'readme.md'
  )

  return files.map((file) => {
    const raw = readFileSync(join(CONTENT_DIR, file), 'utf-8')
    const { data, content } = matter(raw)

    const parsed = frontMatterSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error(`content/resources/${file}: invalid front matter — ${parsed.error.message}`)
    }

    const expectedSlug = basename(file, '.md')
    if (parsed.data.slug !== expectedSlug) {
      throw new Error(
        `content/resources/${file}: front-matter slug "${parsed.data.slug}" does not match ` +
          `the filename "${expectedSlug}".`
      )
    }

    return { ...parsed.data, body: content.trim() }
  })
}
