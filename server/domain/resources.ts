// [FR5] Deterministic ranking of psychoeducational resources for a completed screening's risk
// band. Pure and side-effect-free, the same discipline as triage.ts: the caller
// (server/api/screening/[id]/complete.post.ts) loads the active Resource rows from Postgres and
// passes them in already-shaped as candidates, so this file never imports Prisma and stays
// testable with plain fixture data.

import type { Gad7SeverityBand, Phq9SeverityBand } from './scoring'
import type { RiskLevel } from './triage'

export type { RiskLevel }

const RISK_LEVEL_ORDER: readonly RiskLevel[] = ['MINIMAL', 'MILD', 'MODERATE', 'HIGH', 'CRISIS']

const PHQ9_BAND_SEVERITY: Record<Phq9SeverityBand, number> = {
  MINIMAL: 0,
  MILD: 1,
  MODERATE: 2,
  MODERATELY_SEVERE: 3,
  SEVERE: 4
}
const PHQ9_MAX_SEVERITY = 4

const GAD7_BAND_SEVERITY: Record<Gad7SeverityBand, number> = {
  MINIMAL: 0,
  MILD: 1,
  MODERATE: 2,
  SEVERE: 3
}
const GAD7_MAX_SEVERITY = 3

export type DrivingInstrument = 'PHQ9' | 'GAD7' | 'BOTH'

// PHQ-9 has five severity bands and GAD-7 has four, so their raw band indices are not directly
// comparable — a MODERATE GAD-7 (index 2 of 3) sits proportionally further along its own scale
// than a MODERATE PHQ-9 (index 2 of 4). Normalising each band to a 0-1 fraction of its own scale
// before comparing is what makes "which instrument is driving this result" a fair question to
// ask across two differently-sized band vocabularies, without touching triage.ts (which has no
// opinion on this at all — see its own file for why).
export function determineDrivingInstrument(
  phq9Band: Phq9SeverityBand,
  gad7Band: Gad7SeverityBand
): DrivingInstrument {
  const phq9Severity = PHQ9_BAND_SEVERITY[phq9Band] / PHQ9_MAX_SEVERITY
  const gad7Severity = GAD7_BAND_SEVERITY[gad7Band] / GAD7_MAX_SEVERITY

  if (phq9Severity === gad7Severity) return 'BOTH'
  return phq9Severity > gad7Severity ? 'PHQ9' : 'GAD7'
}

export interface ResourceCandidate {
  id: string
  slug: string
  title: string
  tags: string[]
  minRisk: RiskLevel
  maxRisk: RiskLevel
  readingTimeMinutes: number
  isActive: boolean
}

export interface RankedResource {
  resourceId: string
  slug: string
  title: string
  readingTimeMinutes: number
  rank: number
}

const MIN_RECOMMENDATIONS = 3
const MAX_RECOMMENDATIONS = 5

function isInRiskRange(riskLevel: RiskLevel, minRisk: RiskLevel, maxRisk: RiskLevel): boolean {
  const level = RISK_LEVEL_ORDER.indexOf(riskLevel)
  return level >= RISK_LEVEL_ORDER.indexOf(minRisk) && level <= RISK_LEVEL_ORDER.indexOf(maxRisk)
}

function score(
  resource: ResourceCandidate,
  riskLevel: RiskLevel,
  drivingInstrument: DrivingInstrument
): number {
  let points = 0

  // A resource tagged 'orientation' is foundational — relevant to everyone, regardless of what
  // is driving their result — so it always sorts to the top of an eligible list.
  if (resource.tags.includes('orientation')) points += 100

  if (drivingInstrument === 'PHQ9' && resource.tags.includes('depression')) points += 20
  if (drivingInstrument === 'GAD7' && resource.tags.includes('anxiety')) points += 20
  if (drivingInstrument === 'BOTH') {
    if (resource.tags.includes('depression')) points += 10
    if (resource.tags.includes('anxiety')) points += 10
  }

  if ((riskLevel === 'HIGH' || riskLevel === 'CRISIS') && resource.tags.includes('safety')) {
    points += 30
  }
  if (
    (riskLevel === 'MODERATE' || riskLevel === 'HIGH' || riskLevel === 'CRISIS') &&
    resource.tags.includes('professional-care')
  ) {
    points += 15
  }
  if (resource.tags.includes('coping')) points += 5

  return points
}

// [FR5] Same inputs always produce the same ranked list in the same order — no randomness, no
// per-request variation — so two people with an identical result see the same recommendations,
// and this is a fact a test can assert exactly, not just approximately.
export function computeResourceRecommendations(
  candidates: readonly ResourceCandidate[],
  riskLevel: RiskLevel,
  drivingInstrument: DrivingInstrument
): RankedResource[] {
  const active = candidates.filter((candidate) => candidate.isActive)
  let eligible = active.filter((candidate) =>
    isInRiskRange(riskLevel, candidate.minRisk, candidate.maxRisk)
  )

  // Defensive, not load-bearing under the current content set (content/resources/ intentionally
  // spans every risk band): if the catalogue's own risk ranges ever left a band short, fall back
  // to any active orientation resource rather than silently returning fewer than the acceptance
  // criterion ("every risk level maps to a non-empty ranked list") requires.
  if (eligible.length < MIN_RECOMMENDATIONS) {
    const eligibleIds = new Set(eligible.map((candidate) => candidate.id))
    const fallback = active.filter(
      (candidate) => candidate.tags.includes('orientation') && !eligibleIds.has(candidate.id)
    )
    eligible = [...eligible, ...fallback]
  }

  return eligible
    .map((resource) => ({ resource, points: score(resource, riskLevel, drivingInstrument) }))
    .sort((a, b) => b.points - a.points || a.resource.title.localeCompare(b.resource.title))
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ resource }, index) => ({
      resourceId: resource.id,
      slug: resource.slug,
      title: resource.title,
      readingTimeMinutes: resource.readingTimeMinutes,
      rank: index + 1
    }))
}
