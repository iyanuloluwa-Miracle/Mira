import { describe, expect, it } from 'vitest'
import {
  computeResourceRecommendations,
  determineDrivingInstrument,
  type ResourceCandidate,
  type RiskLevel
} from './resources'

// Mirrors content/resources/*.md's actual minRisk/maxRisk/tags closely enough to exercise real
// coverage gaps, without depending on the seeded content itself (this file has zero Prisma/DB
// dependency, same as resources.ts).
const CATALOGUE: ResourceCandidate[] = [
  {
    id: 'orientation',
    slug: 'what-your-score-means',
    title: 'What Your Screening Score Means',
    tags: ['orientation', 'screening'],
    minRisk: 'MINIMAL',
    maxRisk: 'CRISIS',
    readingTimeMinutes: 4,
    isActive: true
  },
  {
    id: 'depression',
    slug: 'understanding-low-mood',
    title: 'Understanding Low Mood',
    tags: ['depression', 'psychoeducation'],
    minRisk: 'MINIMAL',
    maxRisk: 'HIGH',
    readingTimeMinutes: 5,
    isActive: true
  },
  {
    id: 'anxiety',
    slug: 'understanding-anxiety',
    title: 'Understanding Anxiety',
    tags: ['anxiety', 'psychoeducation'],
    minRisk: 'MINIMAL',
    maxRisk: 'HIGH',
    readingTimeMinutes: 5,
    isActive: true
  },
  {
    id: 'grounding',
    slug: 'grounding-and-breathing',
    title: 'Grounding and Breathing Techniques',
    tags: ['coping', 'anxiety', 'orientation'],
    minRisk: 'MINIMAL',
    maxRisk: 'CRISIS',
    readingTimeMinutes: 3,
    isActive: true
  },
  {
    id: 'safety',
    slug: 'when-to-seek-urgent-help',
    title: 'When to Seek Urgent Help',
    tags: ['safety', 'orientation'],
    minRisk: 'MILD',
    maxRisk: 'CRISIS',
    readingTimeMinutes: 3,
    isActive: true
  },
  {
    id: 'help-seeking',
    slug: 'finding-help-in-nigeria',
    title: 'Finding Help in Nigeria',
    tags: ['professional-care', 'help-seeking'],
    minRisk: 'MODERATE',
    maxRisk: 'CRISIS',
    readingTimeMinutes: 4,
    isActive: true
  },
  {
    id: 'coping',
    slug: 'managing-everyday-stress',
    title: 'Everyday Stress and How to Manage It',
    tags: ['coping'],
    minRisk: 'MINIMAL',
    maxRisk: 'MODERATE',
    readingTimeMinutes: 4,
    isActive: true
  },
  {
    id: 'inactive',
    slug: 'retired-resource',
    title: 'A Retired Resource',
    tags: ['orientation'],
    minRisk: 'MINIMAL',
    maxRisk: 'CRISIS',
    readingTimeMinutes: 2,
    isActive: false
  }
]

const ALL_RISK_LEVELS: RiskLevel[] = ['MINIMAL', 'MILD', 'MODERATE', 'HIGH', 'CRISIS']

describe('computeResourceRecommendations — acceptance: every risk level maps to a non-empty list', () => {
  it.each(ALL_RISK_LEVELS)('%s produces at least one ranked resource', (riskLevel) => {
    const result = computeResourceRecommendations(CATALOGUE, riskLevel, 'BOTH')
    expect(result.length).toBeGreaterThan(0)
  })

  it.each(ALL_RISK_LEVELS)('%s never returns more than 5 resources', (riskLevel) => {
    const result = computeResourceRecommendations(CATALOGUE, riskLevel, 'BOTH')
    expect(result.length).toBeLessThanOrEqual(5)
  })
})

describe('computeResourceRecommendations — eligibility', () => {
  it('excludes an inactive resource even when its risk range matches', () => {
    const result = computeResourceRecommendations(CATALOGUE, 'MINIMAL', 'BOTH')
    expect(result.some((r) => r.slug === 'retired-resource')).toBe(false)
  })

  it('excludes a resource whose maxRisk is below the current risk level', () => {
    const result = computeResourceRecommendations(CATALOGUE, 'CRISIS', 'BOTH')
    // managing-everyday-stress caps at MODERATE
    expect(result.some((r) => r.slug === 'managing-everyday-stress')).toBe(false)
  })

  it('excludes a resource whose minRisk is above the current risk level', () => {
    const result = computeResourceRecommendations(CATALOGUE, 'MINIMAL', 'BOTH')
    // finding-help-in-nigeria starts at MODERATE
    expect(result.some((r) => r.slug === 'finding-help-in-nigeria')).toBe(false)
  })
})

describe('computeResourceRecommendations — ranking', () => {
  it('always ranks an orientation-tagged resource first among eligible resources', () => {
    const result = computeResourceRecommendations(CATALOGUE, 'MODERATE', 'BOTH')
    const topResource = CATALOGUE.find((candidate) => candidate.slug === result[0]!.slug)
    expect(topResource?.tags).toContain('orientation')
  })

  it('assigns sequential 1-based ranks with no gaps', () => {
    const result = computeResourceRecommendations(CATALOGUE, 'MODERATE', 'BOTH')
    expect(result.map((r) => r.rank)).toEqual(result.map((_, i) => i + 1))
  })

  it('is deterministic — identical inputs produce an identical ordering', () => {
    const first = computeResourceRecommendations(CATALOGUE, 'MODERATE', 'PHQ9')
    const second = computeResourceRecommendations(CATALOGUE, 'MODERATE', 'PHQ9')
    expect(second.map((r) => r.slug)).toEqual(first.map((r) => r.slug))
  })

  it('prioritises a depression-tagged resource when PHQ-9 is driving the result', () => {
    const result = computeResourceRecommendations(CATALOGUE, 'MODERATE', 'PHQ9')
    const depressionRank = result.findIndex((r) => r.slug === 'understanding-low-mood')
    const anxietyRank = result.findIndex((r) => r.slug === 'understanding-anxiety')
    expect(depressionRank).toBeGreaterThanOrEqual(0)
    expect(depressionRank).toBeLessThan(anxietyRank === -1 ? Infinity : anxietyRank)
  })

  it('prioritises an anxiety-tagged resource when GAD-7 is driving the result', () => {
    const result = computeResourceRecommendations(CATALOGUE, 'MODERATE', 'GAD7')
    const depressionRank = result.findIndex((r) => r.slug === 'understanding-low-mood')
    const anxietyRank = result.findIndex((r) => r.slug === 'understanding-anxiety')
    expect(anxietyRank).toBeGreaterThanOrEqual(0)
    expect(anxietyRank).toBeLessThan(depressionRank === -1 ? Infinity : depressionRank)
  })

  it('boosts a safety-tagged resource above a plain orientation resource at CRISIS', () => {
    // Both are orientation-tagged (+100), but when-to-seek-urgent-help also picks up the
    // safety bonus (+30) that only applies at HIGH/CRISIS, so it outranks the plain orientation
    // resource here even though the reverse is true at lower risk levels (see the test above).
    const result = computeResourceRecommendations(CATALOGUE, 'CRISIS', 'BOTH')
    expect(result[0]!.slug).toBe('when-to-seek-urgent-help')
    expect(result.some((r) => r.slug === 'what-your-score-means')).toBe(true)
  })

  it('breaks ties deterministically by title when scores are equal', () => {
    const tiedCatalogue: ResourceCandidate[] = [
      {
        id: 'b',
        slug: 'b-resource',
        title: 'B Resource',
        tags: [],
        minRisk: 'MINIMAL',
        maxRisk: 'CRISIS',
        readingTimeMinutes: 1,
        isActive: true
      },
      {
        id: 'a',
        slug: 'a-resource',
        title: 'A Resource',
        tags: [],
        minRisk: 'MINIMAL',
        maxRisk: 'CRISIS',
        readingTimeMinutes: 1,
        isActive: true
      },
      {
        id: 'c',
        slug: 'c-resource',
        title: 'C Resource',
        tags: [],
        minRisk: 'MINIMAL',
        maxRisk: 'CRISIS',
        readingTimeMinutes: 1,
        isActive: true
      }
    ]
    const result = computeResourceRecommendations(tiedCatalogue, 'MINIMAL', 'BOTH')
    expect(result.map((r) => r.slug)).toEqual(['a-resource', 'b-resource', 'c-resource'])
  })
})

describe('computeResourceRecommendations — undersupplied catalogue fallback', () => {
  it('still returns a non-empty list when a risk level has fewer than 3 eligible resources', () => {
    const sparseCatalogue: ResourceCandidate[] = [
      {
        id: 'orientation-only',
        slug: 'only-orientation',
        title: 'Only Orientation',
        tags: ['orientation'],
        minRisk: 'MINIMAL',
        maxRisk: 'CRISIS',
        readingTimeMinutes: 2,
        isActive: true
      },
      {
        id: 'narrow',
        slug: 'narrow-band',
        title: 'Narrow Band Resource',
        tags: [],
        minRisk: 'HIGH',
        maxRisk: 'HIGH',
        readingTimeMinutes: 2,
        isActive: true
      }
    ]
    const result = computeResourceRecommendations(sparseCatalogue, 'MINIMAL', 'BOTH')
    expect(result.length).toBeGreaterThan(0)
    expect(result.some((r) => r.slug === 'only-orientation')).toBe(true)
  })
})

describe('determineDrivingInstrument', () => {
  it('picks PHQ9 when the PHQ-9 band is proportionally more severe', () => {
    expect(determineDrivingInstrument('MODERATELY_SEVERE', 'MILD')).toBe('PHQ9')
  })

  it('picks GAD7 when the GAD-7 band is proportionally more severe', () => {
    expect(determineDrivingInstrument('MILD', 'SEVERE')).toBe('GAD7')
  })

  it('picks BOTH when both bands are at minimal severity', () => {
    expect(determineDrivingInstrument('MINIMAL', 'MINIMAL')).toBe('BOTH')
  })

  it('picks BOTH when both bands sit at the same proportional severity', () => {
    // PHQ-9 MODERATE = 2/4 = 0.5; GAD-7 MODERATE = 2/3 ≈ 0.667 — not equal, so this checks a
    // genuinely proportional tie instead: PHQ-9 SEVERE (4/4=1) vs GAD-7 SEVERE (3/3=1).
    expect(determineDrivingInstrument('SEVERE', 'SEVERE')).toBe('BOTH')
  })

  it('picks PHQ9 when GAD-7 is MINIMAL and PHQ-9 is anything above MINIMAL', () => {
    expect(determineDrivingInstrument('MILD', 'MINIMAL')).toBe('PHQ9')
  })
})
