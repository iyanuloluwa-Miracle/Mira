import { describe, expect, it } from 'vitest'
import { mapClassifierResultToPrediction } from './classifier-risk-mapping'

describe('mapClassifierResultToPrediction — NON_SYMPTOMATIC', () => {
  it('always maps to MINIMAL regardless of probability', () => {
    expect(
      mapClassifierResultToPrediction({ predictedLabel: 'NON_SYMPTOMATIC', probability: 0.01 })
    ).toEqual({ suggestedRiskLevel: 'MINIMAL' })
    expect(
      mapClassifierResultToPrediction({ predictedLabel: 'NON_SYMPTOMATIC', probability: 0.49 })
    ).toEqual({ suggestedRiskLevel: 'MINIMAL' })
  })
})

describe('mapClassifierResultToPrediction — SYMPTOMATIC', () => {
  it('maps a low-but-symptomatic probability to MILD', () => {
    expect(
      mapClassifierResultToPrediction({ predictedLabel: 'SYMPTOMATIC', probability: 0.5 })
    ).toEqual({ suggestedRiskLevel: 'MILD' })
  })

  it('maps a mid-range probability to MODERATE at the boundary and above', () => {
    expect(
      mapClassifierResultToPrediction({ predictedLabel: 'SYMPTOMATIC', probability: 0.65 })
    ).toEqual({ suggestedRiskLevel: 'MODERATE' })
    expect(
      mapClassifierResultToPrediction({ predictedLabel: 'SYMPTOMATIC', probability: 0.84 })
    ).toEqual({ suggestedRiskLevel: 'MODERATE' })
  })

  it('maps a high probability to HIGH at the boundary and above', () => {
    expect(
      mapClassifierResultToPrediction({ predictedLabel: 'SYMPTOMATIC', probability: 0.85 })
    ).toEqual({ suggestedRiskLevel: 'HIGH' })
    expect(
      mapClassifierResultToPrediction({ predictedLabel: 'SYMPTOMATIC', probability: 1 })
    ).toEqual({ suggestedRiskLevel: 'HIGH' })
  })

  it('never suggests CRISIS — that type does not exist on RuleBasedRiskLevel', () => {
    const result = mapClassifierResultToPrediction({
      predictedLabel: 'SYMPTOMATIC',
      probability: 1
    })
    expect(result.suggestedRiskLevel).not.toBe('CRISIS')
  })
})
