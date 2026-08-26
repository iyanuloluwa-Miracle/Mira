// [FR3][NFR5][R3][R4] Shared by complete.post.ts and result.get.ts — both need to build the
// same textAnalysis shape from a session's free-text state, and both must include it: the
// client's ScreeningResult type (app/composables/useScreeningSession.ts) requires textAnalysis
// on every result, golden path (complete()'s response, cached client-side) included. Omitting
// it from either endpoint's response makes the result page's `result.textAnalysis.available`
// throw on undefined and blank the whole page — this file exists so that can't happen by
// forgetting to call it from one of the two places.
//
// The free text is decrypted here, briefly, only to compute spans over it — the decrypted
// string itself is never assigned to anything the caller returns, only walked by
// computeAttributionSpans to build the span list actually sent back.

import { computeAttributionSpans } from '../domain/attribution'
import type { ClassifierTokenAttribution } from '../domain/model-contract'
import { decryptField } from './crypto'

export type TextAnalysis =
  | { available: true; spans: ReturnType<typeof computeAttributionSpans> }
  | { available: false; reason: 'text-free' | 'unavailable' }

export function buildTextAnalysis(session: {
  freeTextExcluded: boolean
  freeTextEntries: Array<{ ciphertext: Uint8Array; iv: Uint8Array; authTag: Uint8Array }>
  modelPredictions: Array<{ topTokensJson: unknown }>
  riskLevel: string
}): TextAnalysis {
  // The crisis screen never shows scores, bands, or this explanation — no reason to decrypt
  // and expose the text at all for a result that will never render it.
  if (session.riskLevel === 'CRISIS') return { available: false, reason: 'text-free' }

  const entry = session.freeTextEntries[0]
  if (!entry || session.freeTextExcluded) return { available: false, reason: 'text-free' }

  const prediction = session.modelPredictions[0]
  if (!prediction) return { available: false, reason: 'unavailable' }

  const text = decryptField({
    ciphertext: Buffer.from(entry.ciphertext),
    iv: Buffer.from(entry.iv),
    authTag: Buffer.from(entry.authTag)
  })
  const topTokens = prediction.topTokensJson as ClassifierTokenAttribution[]

  return { available: true, spans: computeAttributionSpans(text, topTokens) }
}
