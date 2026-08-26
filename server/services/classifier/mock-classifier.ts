// [FR3][R7] A deterministic stand-in for a real trained model — same input always produces the
// same output, so tests and demos are reproducible without a running Python service. Never to
// be mistaken for a real result: every response carries modelVersion MOCK_MODEL_VERSION
// ("mock-0.1"), defined once in server/domain/model-contract.ts so both this file and anything
// checking for it stay in sync.

import { MOCK_MODEL_VERSION } from '../../domain/model-contract'
import type {
  ClassifierRequest,
  ClassifierResponse,
  ClassifierTokenAttribution
} from '../../domain/model-contract'
import type { ClassifierClient } from './client'

const SYMPTOMATIC_THRESHOLD = 0.5

// Deterministic FNV-1a-style hash, normalized to [0, 1). Pure function of the input string —
// no randomness, no clock, no external state — which is what makes the mock reproducible.
function hashToUnitInterval(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0xffffffff
}

// A small, illustrative lexicon — not a clinical wordlist, just enough to make the mock's
// behavior legible in a demo (concerning-sounding phrases push the probability up) and to give
// determinism tests something to assert on beyond "the hash is stable." Weights are additive
// and capped at 1.0 in classifyWithMock below.
const LEXICON: ReadonlyArray<{ term: string; weight: number }> = [
  { term: 'hopeless', weight: 0.35 },
  { term: 'worthless', weight: 0.35 },
  { term: 'no point', weight: 0.3 },
  { term: "can't go on", weight: 0.4 },
  { term: 'give up', weight: 0.25 },
  { term: 'empty inside', weight: 0.25 },
  { term: 'burden', weight: 0.2 },
  { term: 'tired of everything', weight: 0.3 }
]

function matchLexicon(normalizedText: string): ClassifierTokenAttribution[] {
  return LEXICON.filter((entry) => normalizedText.includes(entry.term)).map((entry) => ({
    token: entry.term,
    attribution: entry.weight
  }))
}

export class MockClassifier implements ClassifierClient {
  async classify(request: ClassifierRequest): Promise<ClassifierResponse> {
    const start = Date.now()
    const normalizedText = request.text.toLowerCase()

    const baseProbability = hashToUnitInterval(request.text) * 0.4
    const matches = matchLexicon(normalizedText)
    const lexiconBoost = matches.reduce((sum, match) => sum + match.attribution, 0)
    const probability = Math.min(1, baseProbability + lexiconBoost)

    return {
      probability,
      label: probability >= SYMPTOMATIC_THRESHOLD ? 'SYMPTOMATIC' : 'NON_SYMPTOMATIC',
      modelName: 'mira-mock-classifier',
      modelVersion: MOCK_MODEL_VERSION,
      topTokens: matches,
      latencyMs: Date.now() - start
    }
  }
}
