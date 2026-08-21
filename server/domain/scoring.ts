// [FR2] Pure PHQ-9 / GAD-7 scoring: turns validated item answers into subscale totals and
// severity bands. No I/O, no framework imports — see server/domain/README.md. Every function
// here is a plain input-to-output transform: same input always produces the same output, and
// nothing is mutated or logged along the way.

import { GAD7_ITEMS, type Gad7ItemCode } from './instruments/gad7'
import { PHQ9_ITEM_NINE_CODE, PHQ9_ITEMS, type Phq9ItemCode } from './instruments/phq9'

export class IncompleteResponseError extends Error {
  constructor(missingItemCodes: string[]) {
    super(`Missing response(s) for: ${missingItemCodes.join(', ')}`)
    this.name = 'IncompleteResponseError'
  }
}

export class InvalidResponseValueError extends Error {
  constructor(itemCode: string, value: unknown) {
    super(`Response for ${itemCode} must be an integer between 0 and 3, got ${String(value)}`)
    this.name = 'InvalidResponseValueError'
  }
}

// Rejects the whole submission — rather than scoring what's present — the moment any item is
// missing or out of range, so a partial or malformed submission can never silently produce a
// band that looks legitimate.
function validateResponses<Code extends string>(
  responses: Partial<Record<Code, number>>,
  itemCodes: readonly Code[]
): void {
  const missing = itemCodes.filter((code) => responses[code] === undefined)
  if (missing.length > 0) throw new IncompleteResponseError(missing)

  for (const code of itemCodes) {
    const value = responses[code]
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 3) {
      throw new InvalidResponseValueError(code, value)
    }
  }
}

function sum<Code extends string>(
  responses: Partial<Record<Code, number>>,
  itemCodes: readonly Code[]
): number {
  return itemCodes.reduce((total, code) => total + (responses[code] as number), 0)
}

export type Phq9SeverityBand = 'MINIMAL' | 'MILD' | 'MODERATE' | 'MODERATELY_SEVERE' | 'SEVERE'

export interface Phq9ScoreResult {
  total: number
  band: Phq9SeverityBand
  // [R2] True when item 9 (thoughts of self-harm) is answered above zero. server/domain/
  // safety.ts treats this as an unconditional CRISIS override — this flag is what carries that
  // fact out of scoring, so nothing downstream has to re-derive it from raw item values.
  itemNineElevated: boolean
}

function phq9Band(total: number): Phq9SeverityBand {
  if (total <= 4) return 'MINIMAL'
  if (total <= 9) return 'MILD'
  if (total <= 14) return 'MODERATE'
  if (total <= 19) return 'MODERATELY_SEVERE'
  return 'SEVERE'
}

// [FR2] Scores the 9 core PHQ-9 items (not the functional-impairment follow-up, which is never
// part of the 0-27 total). Throws IncompleteResponseError or InvalidResponseValueError rather
// than returning a partial score for malformed input.
export function scorePhq9(responses: Partial<Record<Phq9ItemCode, number>>): Phq9ScoreResult {
  const itemCodes = PHQ9_ITEMS.map((item) => item.itemCode)
  validateResponses(responses, itemCodes)

  const total = sum(responses, itemCodes)

  return {
    total,
    band: phq9Band(total),
    itemNineElevated: (responses[PHQ9_ITEM_NINE_CODE] as number) > 0
  }
}

export type Gad7SeverityBand = 'MINIMAL' | 'MILD' | 'MODERATE' | 'SEVERE'

export interface Gad7ScoreResult {
  total: number
  band: Gad7SeverityBand
}

function gad7Band(total: number): Gad7SeverityBand {
  if (total <= 4) return 'MINIMAL'
  if (total <= 9) return 'MILD'
  if (total <= 14) return 'MODERATE'
  return 'SEVERE'
}

// [FR2] Scores all 7 GAD-7 items. Throws IncompleteResponseError or InvalidResponseValueError
// rather than returning a partial score for malformed input.
export function scoreGad7(responses: Partial<Record<Gad7ItemCode, number>>): Gad7ScoreResult {
  const itemCodes = GAD7_ITEMS.map((item) => item.itemCode)
  validateResponses(responses, itemCodes)

  const total = sum(responses, itemCodes)

  return {
    total,
    band: gad7Band(total)
  }
}
