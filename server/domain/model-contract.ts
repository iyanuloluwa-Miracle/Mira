// [FR3][R1][R7] Shared types describing the input/output contract between the classifier
// service (server/services/classifier/) and anything that consumes its result — kept here,
// not in the service module, so server/domain never needs to import a service directly. See
// services/classifier/README.md for the Python side's matching HTTP contract.
//
// Deliberately zero imports: same discipline as triage.ts — this file is plain types and pure
// functions, structurally incapable of reaching into Nuxt, Nitro, or a service module.

export interface ClassifierRequest {
  text: string
  // Opaque, used for correlation only — never logged alongside the text itself (rule R4).
  requestId: string
}

export type ClassifierLabel = 'SYMPTOMATIC' | 'NON_SYMPTOMATIC'

export interface ClassifierTokenAttribution {
  token: string
  attribution: number
}

export interface ClassifierResponse {
  probability: number
  label: ClassifierLabel
  modelName: string
  modelVersion: string
  topTokens: ClassifierTokenAttribution[]
  latencyMs: number
}

// [R1] Never decides anything on its own — this is a signal, consumed the same way
// server/domain/triage.ts's ModelPrediction already is, which may raise a rule-based risk
// level by at most one step and never lower or set one outright.
export interface ModelPrediction {
  suggestedRiskLevel: 'MINIMAL' | 'MILD' | 'MODERATE' | 'HIGH'
}

// [R7] classify() (server/services/classifier/index.ts) never throws and never rejects a
// screening — it always resolves to one of these two outcomes, so a caller can never forget to
// handle a network failure. 'unavailable' covers every failure mode indistinguishably (timeout,
// connection refused, non-2xx, malformed response, circuit open): the caller's job is only ever
// "proceed without the signal," never "figure out why."
export type ClassifierOutcome =
  { status: 'ok'; response: ClassifierResponse } | { status: 'unavailable'; reason: string }

// Every mock response carries this exact modelVersion so a mock result can never be mistaken
// for a real model's output in the database or in an evaluation write-up.
export const MOCK_MODEL_VERSION = 'mock-0.1'

// [R7] Pure, one-line explanation of what happened to the text-analysis signal, meant to be
// surfaced alongside a triage result so a degraded run is stated plainly rather than silently
// absent. Returns null on success: what to show for a successful classification is a decision
// for whatever prompt wires this into the result page, not this seam.
export function describeClassifierOutcome(outcome: ClassifierOutcome): string | null {
  if (outcome.status === 'ok') return null
  return 'Text analysis was unavailable for this screening; this result is based on your questionnaire answers alone.'
}
