// [FR3][R1] Turns a stored classifier result (server/domain/model-contract.ts's
// ClassifierResponse, as persisted in the ModelPrediction table) into the ModelPrediction shape
// server/domain/triage.ts's computeTriage() actually accepts. Kept in its own file, separate
// from triage.ts, so adding this mapping is not a change to the clinically-reviewed rules file
// itself — triage.ts's own diff for this prompt is zero. That said, this file decides what
// suggestedRiskLevel a classifier result maps to, which is exactly the kind of clinically-
// adjacent judgment call CONTRIBUTING.md asks for review on; flagging it as such rather than
// treating "it's a new file, not an edit to triage.ts" as a loophole.
//
// Why getting this exactly right matters less than it might seem: triage.ts's own
// applyModelAdjustment can only ever raise the rule-based level by exactly one step, never set
// or lower it (rule R1), regardless of what suggestedRiskLevel this function returns. A
// miscalibrated threshold here can make the model's opinion count for too little or too much by
// one step — it structurally cannot make the model decide the outcome.

import type { RuleBasedRiskLevel } from './triage'
import type { ClassifierLabel } from './model-contract'

export interface StoredClassifierResult {
  predictedLabel: ClassifierLabel
  probability: number
}

// Thresholds only distinguish *how strongly* SYMPTOMATIC the model was — a NON_SYMPTOMATIC
// result never suggests anything above MINIMAL, no matter its probability, since probability
// there measures confidence in "not symptomatic," not degree of symptom severity.
const HIGH_THRESHOLD = 0.85
const MODERATE_THRESHOLD = 0.65

export function mapClassifierResultToPrediction(result: StoredClassifierResult): {
  suggestedRiskLevel: RuleBasedRiskLevel
} {
  if (result.predictedLabel === 'NON_SYMPTOMATIC') {
    return { suggestedRiskLevel: 'MINIMAL' }
  }

  if (result.probability >= HIGH_THRESHOLD) return { suggestedRiskLevel: 'HIGH' }
  if (result.probability >= MODERATE_THRESHOLD) return { suggestedRiskLevel: 'MODERATE' }
  return { suggestedRiskLevel: 'MILD' }
}
