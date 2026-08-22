import { describe, expect, it } from 'vitest'
import { computeTriage, type RuleBasedRiskLevel } from './triage'

describe('computeTriage — item 9 override (rule R2)', () => {
  it.each([1, 2, 3])('forces CRISIS when item 9 is %i, regardless of totals', (itemNineValue) => {
    const result = computeTriage({ phq9: 0, gad7: 0, itemNineValue })
    expect(result.riskLevel).toBe('CRISIS')
    expect(result.escalate).toBe(true)
    expect(result.requiresImmediateSafetyScreen).toBe(true)
  })

  it('takes precedence over an otherwise MINIMAL total', () => {
    const result = computeTriage({ phq9: 0, gad7: 0, itemNineValue: 1 })
    expect(result.riskLevel).toBe('CRISIS')
  })

  it('takes precedence even over score totals that would independently be HIGH', () => {
    const result = computeTriage({ phq9: 27, gad7: 21, itemNineValue: 1 })
    expect(result.riskLevel).toBe('CRISIS')
  })

  it('is completely independent of the model prediction — CRISIS regardless of what it suggests', () => {
    const result = computeTriage({
      phq9: 0,
      gad7: 0,
      itemNineValue: 1,
      modelPrediction: { suggestedRiskLevel: 'MINIMAL' }
    })
    expect(result.riskLevel).toBe('CRISIS')
    expect(result.rationale).toHaveLength(1)
    expect(result.rationale.join(' ')).not.toMatch(/model|classifier|text-analysis/i)
  })

  it('does not trigger when item 9 is exactly zero', () => {
    const result = computeTriage({ phq9: 0, gad7: 0, itemNineValue: 0 })
    expect(result.riskLevel).not.toBe('CRISIS')
  })

  it('names the item and its value in plain language, not a rule id', () => {
    const result = computeTriage({ phq9: 0, gad7: 0, itemNineValue: 2 })
    expect(result.rationale).toHaveLength(1)
    expect(result.rationale[0]).toContain('item 9')
    expect(result.rationale[0]).toContain('2')
    expect(result.rationale[0]).not.toMatch(/rule|R2/i)
  })
})

describe('computeTriage — PHQ-9-driven rule-based levels (GAD-7 held at 0)', () => {
  it.each([
    [0, 'MINIMAL'],
    [4, 'MINIMAL'],
    [9, 'MINIMAL'],
    [10, 'MILD'],
    [14, 'MILD'],
    [15, 'MODERATE'],
    [19, 'MODERATE'],
    [20, 'HIGH'],
    [27, 'HIGH']
  ] as const)('PHQ-9 total %i maps to %s', (phq9, expectedLevel) => {
    const result = computeTriage({ phq9, gad7: 0, itemNineValue: 0 })
    expect(result.riskLevel).toBe(expectedLevel)
  })
})

describe('computeTriage — GAD-7-driven rule-based levels (PHQ-9 held at 0)', () => {
  it.each([
    [0, 'MINIMAL'],
    [4, 'MINIMAL'],
    [5, 'MILD'],
    [9, 'MILD'],
    [10, 'MODERATE'],
    [14, 'MODERATE'],
    [15, 'HIGH'],
    [21, 'HIGH']
  ] as const)('GAD-7 total %i maps to %s', (gad7, expectedLevel) => {
    const result = computeTriage({ phq9: 0, gad7, itemNineValue: 0 })
    expect(result.riskLevel).toBe(expectedLevel)
  })
})

describe('computeTriage — the two instruments combine with OR, higher tier wins', () => {
  it('takes HIGH when only GAD-7 crosses the HIGH threshold', () => {
    // PHQ-9 total 12 alone would be MILD; GAD-7 total 16 alone is HIGH.
    const result = computeTriage({ phq9: 12, gad7: 16, itemNineValue: 0 })
    expect(result.riskLevel).toBe('HIGH')
    expect(result.rationale.join(' ')).toContain('GAD-7')
    expect(result.rationale.join(' ')).not.toContain('PHQ-9')
  })

  it('takes HIGH when only PHQ-9 crosses the HIGH threshold', () => {
    const result = computeTriage({ phq9: 22, gad7: 3, itemNineValue: 0 })
    expect(result.riskLevel).toBe('HIGH')
    expect(result.rationale.join(' ')).toContain('PHQ-9')
    expect(result.rationale.join(' ')).not.toContain('GAD-7')
  })

  it('names both instruments in the rationale when both cross the same tier', () => {
    const result = computeTriage({ phq9: 22, gad7: 16, itemNineValue: 0 })
    expect(result.riskLevel).toBe('HIGH')
    expect(result.rationale).toHaveLength(2)
    expect(result.rationale.join(' ')).toContain('PHQ-9')
    expect(result.rationale.join(' ')).toContain('GAD-7')
  })

  it('names both instruments when both land in MODERATE together', () => {
    const result = computeTriage({ phq9: 17, gad7: 12, itemNineValue: 0 })
    expect(result.riskLevel).toBe('MODERATE')
    expect(result.rationale).toHaveLength(2)
  })

  it('names both instruments when both land in MILD together', () => {
    const result = computeTriage({ phq9: 12, gad7: 7, itemNineValue: 0 })
    expect(result.riskLevel).toBe('MILD')
    expect(result.rationale).toHaveLength(2)
  })

  it('gives a single combined rationale line when both are below every threshold', () => {
    const result = computeTriage({ phq9: 3, gad7: 2, itemNineValue: 0 })
    expect(result.riskLevel).toBe('MINIMAL')
    expect(result.rationale).toHaveLength(1)
    expect(result.rationale[0]).toContain('PHQ-9')
    expect(result.rationale[0]).toContain('GAD-7')
  })
})

describe('computeTriage — escalate and requiresImmediateSafetyScreen per level', () => {
  it.each([
    ['MINIMAL', 0, 0],
    ['MILD', 12, 0],
    ['MODERATE', 17, 0],
    ['HIGH', 22, 0]
  ] as const)(
    '%s never requires an immediate safety screen — only CRISIS does',
    (_level, phq9, gad7) => {
      const result = computeTriage({ phq9, gad7, itemNineValue: 0 })
      expect(result.requiresImmediateSafetyScreen).toBe(false)
    }
  )

  it('CRISIS is the only level that requires an immediate safety screen', () => {
    const result = computeTriage({ phq9: 0, gad7: 0, itemNineValue: 1 })
    expect(result.requiresImmediateSafetyScreen).toBe(true)
  })

  it('escalate is true for HIGH and false for MODERATE/MILD/MINIMAL', () => {
    expect(computeTriage({ phq9: 22, gad7: 0, itemNineValue: 0 }).escalate).toBe(true)
    expect(computeTriage({ phq9: 17, gad7: 0, itemNineValue: 0 }).escalate).toBe(false)
    expect(computeTriage({ phq9: 12, gad7: 0, itemNineValue: 0 }).escalate).toBe(false)
    expect(computeTriage({ phq9: 0, gad7: 0, itemNineValue: 0 }).escalate).toBe(false)
  })
})

describe('computeTriage — model adjustment (rule R1)', () => {
  it('leaves the level unchanged when no model prediction is provided', () => {
    const result = computeTriage({ phq9: 3, gad7: 2, itemNineValue: 0 })
    expect(result.riskLevel).toBe('MINIMAL')
    expect(result.rationale.join(' ')).not.toMatch(/model|signal/i)
  })

  it('does not change the level when the model agrees exactly', () => {
    const result = computeTriage({
      phq9: 12,
      gad7: 0,
      itemNineValue: 0,
      modelPrediction: { suggestedRiskLevel: 'MILD' }
    })
    expect(result.riskLevel).toBe('MILD')
    expect(result.rationale.join(' ')).not.toMatch(/model|signal/i)
  })

  it('never lowers the level when the model suggests something lower', () => {
    const result = computeTriage({
      phq9: 17,
      gad7: 0,
      itemNineValue: 0,
      modelPrediction: { suggestedRiskLevel: 'MINIMAL' }
    })
    expect(result.riskLevel).toBe('MODERATE')
    expect(result.rationale.join(' ')).not.toMatch(/model|signal/i)
  })

  it('raises the level by exactly one step when the model disagrees upward by one step', () => {
    const result = computeTriage({
      phq9: 3,
      gad7: 0,
      itemNineValue: 0,
      modelPrediction: { suggestedRiskLevel: 'MILD' }
    })
    expect(result.riskLevel).toBe('MILD')
    expect(result.rationale.at(-1)).toMatch(/model|signal/i)
    expect(result.rationale.at(-1)).toContain('minimal')
    expect(result.rationale.at(-1)).toContain('mild')
  })

  it('raises by at most one step even when the model suggests three steps up', () => {
    // Rule-based level from these totals is MINIMAL; the model suggests HIGH (3 steps up).
    const result = computeTriage({
      phq9: 3,
      gad7: 0,
      itemNineValue: 0,
      modelPrediction: { suggestedRiskLevel: 'HIGH' }
    })
    expect(result.riskLevel).toBe('MILD')
  })

  it.each(['MINIMAL', 'MILD', 'MODERATE', 'HIGH'] as RuleBasedRiskLevel[])(
    'a %s suggestion never raises an already-HIGH rule-based level past HIGH',
    (suggestedRiskLevel) => {
      const result = computeTriage({
        phq9: 22,
        gad7: 0,
        itemNineValue: 0,
        modelPrediction: { suggestedRiskLevel }
      })
      expect(result.riskLevel).toBe('HIGH')
    }
  )

  it('raising the level also raises escalate to match the final level, not the rule-based one', () => {
    // Rule-based MODERATE does not escalate; raised to HIGH, it must.
    const result = computeTriage({
      phq9: 17,
      gad7: 0,
      itemNineValue: 0,
      modelPrediction: { suggestedRiskLevel: 'HIGH' }
    })
    expect(result.riskLevel).toBe('HIGH')
    expect(result.escalate).toBe(true)
  })
})

describe('computeTriage — purity', () => {
  it('is deterministic: identical input produces identical output', () => {
    const input = {
      phq9: 17,
      gad7: 12,
      itemNineValue: 0,
      modelPrediction: { suggestedRiskLevel: 'HIGH' as const }
    }
    expect(computeTriage(input)).toEqual(computeTriage(input))
  })

  it('does not mutate its input', () => {
    const input = Object.freeze({
      phq9: 17,
      gad7: 12,
      itemNineValue: 0,
      modelPrediction: Object.freeze({ suggestedRiskLevel: 'HIGH' as const })
    })
    expect(() => computeTriage(input)).not.toThrow()
  })
})
