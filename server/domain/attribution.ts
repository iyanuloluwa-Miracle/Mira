// [FR3][NFR5] Maps a classifier's topTokens (server/domain/model-contract.ts) onto the
// original text it was computed from, so a caller can render highlighted spans over the exact
// text the person typed rather than showing the tokens as a disconnected list. Deliberately
// zero imports (model-contract.ts's type is duplicated as a narrower local shape below rather
// than imported) — same discipline as triage.ts: a pure function of its inputs, nothing else.
//
// Why this doesn't trust the classifier for character offsets: server/services/classifier/'s
// Python side sees text as Unicode codepoints; JavaScript strings are UTF-16 code units. A
// character outside the Basic Multilingual Plane (many emoji, some scripts) is one codepoint
// but two UTF-16 code units, so a Python-computed offset and a JS string index silently
// disagree for any text containing one. Rather than getting that translation right at the
// service boundary, this file only ever asks the classifier for token *text* and re-locates it
// in the original string using JS's own indexOf/slice — which are internally consistent with
// each other by construction, so there's no cross-language offset to get wrong.

export interface AttributionToken {
  token: string
  attribution: number
}

export interface AttributionSpan {
  text: string
  highlighted: boolean
  // Present only when highlighted: true. When the same token text matches more than one
  // range (see mergeRanges below), this is the highest attribution among the merged matches.
  attribution: number | null
}

interface Range {
  start: number
  end: number
  attribution: number
}

function findAllOccurrences(haystack: string, needle: string): Range[] {
  if (needle.length === 0) return []

  const ranges: Range[] = []
  const lowerHaystack = haystack.toLowerCase()
  const lowerNeedle = needle.toLowerCase()

  let fromIndex = 0
  for (;;) {
    const index = lowerHaystack.indexOf(lowerNeedle, fromIndex)
    if (index === -1) break
    ranges.push({ start: index, end: index + needle.length, attribution: 0 })
    fromIndex = index + needle.length
  }
  return ranges
}

// Sorts by start index and merges overlapping/adjacent ranges, keeping the highest attribution
// among whatever merged into each other. Overlaps are possible when two lexicon-style tokens
// share a substring (e.g. "give up" and "up") or when the same token occurs back-to-back.
function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return []

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: Range[] = [sorted[0]!]

  for (const range of sorted.slice(1)) {
    const last = merged.at(-1)!
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
      last.attribution = Math.max(last.attribution, range.attribution)
    } else {
      merged.push(range)
    }
  }
  return merged
}

// [NFR5] Pure and total: any text, any topTokens (including none, or tokens that don't appear
// in the text at all — e.g. a paraphrased or truncated model output) produces a valid list of
// spans that concatenate back to exactly the original text.
export function computeAttributionSpans(
  text: string,
  topTokens: readonly AttributionToken[]
): AttributionSpan[] {
  const allRanges = topTokens.flatMap((token) =>
    findAllOccurrences(text, token.token).map((range) => ({
      ...range,
      attribution: token.attribution
    }))
  )
  const ranges = mergeRanges(allRanges)

  if (ranges.length === 0) return [{ text, highlighted: false, attribution: null }]

  const spans: AttributionSpan[] = []
  let cursor = 0

  for (const range of ranges) {
    if (range.start > cursor) {
      spans.push({ text: text.slice(cursor, range.start), highlighted: false, attribution: null })
    }
    spans.push({
      text: text.slice(range.start, range.end),
      highlighted: true,
      attribution: range.attribution
    })
    cursor = range.end
  }
  if (cursor < text.length) {
    spans.push({ text: text.slice(cursor), highlighted: false, attribution: null })
  }

  return spans
}
