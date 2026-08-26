// [FR2] Shared shape for validated screening instruments. Plain types only — see phq9.ts and
// gad7.ts for the actual data, and CONTRIBUTING.md for why changes to item wording need
// clinical review.

export interface ResponseOption {
  value: 0 | 1 | 2 | 3
  label: string
}

export interface InstrumentItem {
  itemCode: string
  prompt: string
}

// PHQ-9's functional-impairment question: a real part of the validated instrument, but scored
// on a different 4-point difficulty scale and never included in the 0-27 symptom total — see
// server/domain/scoring.ts, which only sums InstrumentDefinition.items.
export interface FollowUpQuestion {
  itemCode: string
  prompt: string
  responseOptions: { value: 0 | 1 | 2 | 3; label: string }[]
}

export interface InstrumentDefinition {
  code: 'PHQ9' | 'GAD7'
  name: string
  recallPeriod: string
  instructions: string
  responseOptions: ResponseOption[]
  items: InstrumentItem[]
  followUp?: FollowUpQuestion
}
