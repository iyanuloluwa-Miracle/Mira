// [FR4][FR6][R1][R2] Deterministic triage rules: score(s) -> risk level -> routing decision.
// The most examined file in the repo. No model output may decide, lower, or override a risk
// level here (rule R1). Changes require clinical review — see CONTRIBUTING.md.
//
// Deliberately zero imports: computeTriage is a pure function of three numbers and an optional
// model suggestion, so its independence from any model, LLM, or service module is not just a
// policy — it's structurally impossible to violate by accident here.

export type RuleBasedRiskLevel = 'MINIMAL' | 'MILD' | 'MODERATE' | 'HIGH'

// CRISIS is deliberately not part of RuleBasedRiskLevel: it is reachable only through the
// item-9 override below, never through the score thresholds or the model adjustment, so the
// type system itself keeps a model suggestion from ever expressing CRISIS.
export type RiskLevel = RuleBasedRiskLevel | 'CRISIS'

const RULE_BASED_LADDER: readonly RuleBasedRiskLevel[] = ['MINIMAL', 'MILD', 'MODERATE', 'HIGH']

const RISK_LEVEL_LABELS: Record<RuleBasedRiskLevel, string> = {
  MINIMAL: 'minimal',
  MILD: 'mild',
  MODERATE: 'moderate',
  HIGH: 'high'
}

// [R1] What the classifier contributes: a suggested level, nothing more. computeTriage may use
// this to raise the rule-based level by at most one step — never to set it, never to lower it.
export interface ModelPrediction {
  suggestedRiskLevel: RuleBasedRiskLevel
}

export interface TriageInput {
  phq9: number
  gad7: number
  // Raw PHQ-9 item 9 response value (0-3), not the boolean scoring.ts derives from it — the
  // check against zero happens here, in the file that owns rule R2, rather than being
  // delegated to a flag computed elsewhere.
  itemNineValue: number
  modelPrediction?: ModelPrediction
}

export interface TriageResult {
  riskLevel: RiskLevel
  // [NFR5] Plain-language reasons, not rule ids — this is what the app shows the person to
  // explain why they got the result they did.
  rationale: string[]
  escalate: boolean
  requiresImmediateSafetyScreen: boolean
}

function determineRuleBasedLevel(
  phq9: number,
  gad7: number
): { level: RuleBasedRiskLevel; rationale: string[] } {
  if (phq9 >= 20 || gad7 >= 15) {
    const rationale: string[] = []
    if (phq9 >= 20) rationale.push(`PHQ-9 total of ${phq9} is 20 or higher.`)
    if (gad7 >= 15) rationale.push(`GAD-7 total of ${gad7} is 15 or higher.`)
    return { level: 'HIGH', rationale }
  }

  if ((phq9 >= 15 && phq9 <= 19) || (gad7 >= 10 && gad7 <= 14)) {
    const rationale: string[] = []
    if (phq9 >= 15 && phq9 <= 19) rationale.push(`PHQ-9 total of ${phq9} is between 15 and 19.`)
    if (gad7 >= 10 && gad7 <= 14) rationale.push(`GAD-7 total of ${gad7} is between 10 and 14.`)
    return { level: 'MODERATE', rationale }
  }

  if ((phq9 >= 10 && phq9 <= 14) || (gad7 >= 5 && gad7 <= 9)) {
    const rationale: string[] = []
    if (phq9 >= 10 && phq9 <= 14) rationale.push(`PHQ-9 total of ${phq9} is between 10 and 14.`)
    if (gad7 >= 5 && gad7 <= 9) rationale.push(`GAD-7 total of ${gad7} is between 5 and 9.`)
    return { level: 'MILD', rationale }
  }

  return {
    level: 'MINIMAL',
    rationale: [
      `PHQ-9 total of ${phq9} and GAD-7 total of ${gad7} are both below the threshold for elevated risk.`
    ]
  }
}

// [R1] The only place a model suggestion can influence the outcome: it may raise the
// rule-based level by exactly one step on the ladder above, and only if it disagrees upward.
// Equal or lower suggestions change nothing.
function applyModelAdjustment(
  ruleBasedLevel: RuleBasedRiskLevel,
  modelPrediction: ModelPrediction | undefined
): { level: RuleBasedRiskLevel; rationale: string[] } {
  if (!modelPrediction) return { level: ruleBasedLevel, rationale: [] }

  const ruleIndex = RULE_BASED_LADDER.indexOf(ruleBasedLevel)
  const modelIndex = RULE_BASED_LADDER.indexOf(modelPrediction.suggestedRiskLevel)

  if (modelIndex <= ruleIndex) return { level: ruleBasedLevel, rationale: [] }

  const raisedLevel = RULE_BASED_LADDER[ruleIndex + 1]!

  return {
    level: raisedLevel,
    rationale: [
      'The supplementary text-analysis signal suggested a higher risk level than the score-based ' +
        `rules alone, raising the risk level by one step from ${RISK_LEVEL_LABELS[ruleBasedLevel]} to ` +
        `${RISK_LEVEL_LABELS[raisedLevel]}. A model signal can only raise a risk level, never lower one.`
    ]
  }
}

export function computeTriage(input: TriageInput): TriageResult {
  // [R2] PHQ-9 item 9 above zero forces CRISIS, unconditionally, ahead of every other rule and
  // every model output. No threshold tuning, no exceptions — this is why the check happens
  // first, before the model prediction (if any) is even looked at.
  if (input.itemNineValue > 0) {
    return {
      riskLevel: 'CRISIS',
      rationale: [
        'PHQ-9 item 9 (thoughts of self-harm) was answered above zero ' +
          `(value ${input.itemNineValue} out of 3), which triggers an immediate crisis response ` +
          'regardless of any other score or signal.'
      ],
      escalate: true,
      requiresImmediateSafetyScreen: true
    }
  }

  const { level: ruleBasedLevel, rationale: ruleRationale } = determineRuleBasedLevel(
    input.phq9,
    input.gad7
  )
  const { level: finalLevel, rationale: modelRationale } = applyModelAdjustment(
    ruleBasedLevel,
    input.modelPrediction
  )

  return {
    riskLevel: finalLevel,
    rationale: [...ruleRationale, ...modelRationale],
    escalate: finalLevel === 'HIGH',
    requiresImmediateSafetyScreen: false
  }
}
