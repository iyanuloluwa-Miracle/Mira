import { describe, expect, it } from 'vitest'
import { computeAttributionSpans } from './attribution'

// Every case here also asserts spans reconstruct the exact original text — the one invariant
// that must never break no matter how odd the input.
function reconstruct(spans: ReturnType<typeof computeAttributionSpans>): string {
  return spans.map((span) => span.text).join('')
}

describe('computeAttributionSpans — no tokens', () => {
  it('returns the whole text as a single non-highlighted span', () => {
    const spans = computeAttributionSpans('a plain sentence', [])
    expect(spans).toEqual([{ text: 'a plain sentence', highlighted: false, attribution: null }])
  })

  it('returns a single span for empty text too', () => {
    const spans = computeAttributionSpans('', [])
    expect(spans).toEqual([{ text: '', highlighted: false, attribution: null }])
  })
})

describe('computeAttributionSpans — a single match', () => {
  it('splits into before/highlighted/after around one match in the middle', () => {
    const spans = computeAttributionSpans('I feel hopeless today', [
      { token: 'hopeless', attribution: 0.35 }
    ])
    expect(spans).toEqual([
      { text: 'I feel ', highlighted: false, attribution: null },
      { text: 'hopeless', highlighted: true, attribution: 0.35 },
      { text: ' today', highlighted: false, attribution: null }
    ])
    expect(reconstruct(spans)).toBe('I feel hopeless today')
  })

  it('produces no leading empty span when the match starts at index 0', () => {
    const spans = computeAttributionSpans('hopeless today', [
      { token: 'hopeless', attribution: 0.35 }
    ])
    expect(spans[0]).toEqual({ text: 'hopeless', highlighted: true, attribution: 0.35 })
  })

  it('produces no trailing empty span when the match ends at the text end', () => {
    const spans = computeAttributionSpans('today I feel hopeless', [
      { token: 'hopeless', attribution: 0.35 }
    ])
    expect(spans.at(-1)).toEqual({ text: 'hopeless', highlighted: true, attribution: 0.35 })
  })

  it('matches case-insensitively but preserves the original casing in the rendered span', () => {
    const spans = computeAttributionSpans('I feel HOPELESS today', [
      { token: 'hopeless', attribution: 0.35 }
    ])
    expect(spans.find((s) => s.highlighted)?.text).toBe('HOPELESS')
  })
})

describe('computeAttributionSpans — a token absent from the text', () => {
  it('is silently ignored rather than throwing or corrupting the output', () => {
    const spans = computeAttributionSpans('a completely unrelated sentence', [
      { token: 'hopeless', attribution: 0.35 }
    ])
    expect(spans).toEqual([
      { text: 'a completely unrelated sentence', highlighted: false, attribution: null }
    ])
  })

  it('an empty token string is ignored rather than matching everywhere', () => {
    const spans = computeAttributionSpans('some text', [{ token: '', attribution: 0.5 }])
    expect(spans.every((s) => !s.highlighted)).toBe(true)
  })
})

describe('computeAttributionSpans — multiple occurrences and multiple tokens', () => {
  it('highlights every occurrence of a repeated token', () => {
    const spans = computeAttributionSpans('hopeless and hopeless again', [
      { token: 'hopeless', attribution: 0.35 }
    ])
    const highlighted = spans.filter((s) => s.highlighted)
    expect(highlighted).toHaveLength(2)
    expect(highlighted.every((s) => s.text === 'hopeless')).toBe(true)
  })

  it('highlights distinct non-overlapping tokens independently', () => {
    const spans = computeAttributionSpans('I feel hopeless and worthless', [
      { token: 'hopeless', attribution: 0.35 },
      { token: 'worthless', attribution: 0.4 }
    ])
    const highlighted = spans.filter((s) => s.highlighted)
    expect(highlighted.map((s) => s.text)).toEqual(['hopeless', 'worthless'])
    expect(highlighted.map((s) => s.attribution)).toEqual([0.35, 0.4])
    expect(reconstruct(spans)).toBe('I feel hopeless and worthless')
  })
})

describe('computeAttributionSpans — overlapping matches', () => {
  it('merges overlapping ranges into one highlighted span with the max attribution', () => {
    // "give up" and "up" overlap on "up" — should merge into a single span covering "give up".
    const spans = computeAttributionSpans('I want to give up completely', [
      { token: 'give up', attribution: 0.25 },
      { token: 'up', attribution: 0.9 }
    ])
    const highlighted = spans.filter((s) => s.highlighted)
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]).toEqual({ text: 'give up', highlighted: true, attribution: 0.9 })
    expect(reconstruct(spans)).toBe('I want to give up completely')
  })
})

describe('computeAttributionSpans — multi-byte characters', () => {
  it('keeps a surrogate-pair emoji intact when it sits right before a match', () => {
    // 😀 is a single Unicode codepoint but two UTF-16 code units — the classic case where
    // naive character-counting offsets disagree with JS string indices.
    const text = '😀 I feel hopeless today'
    const spans = computeAttributionSpans(text, [{ token: 'hopeless', attribution: 0.35 }])

    expect(reconstruct(spans)).toBe(text)
    const highlighted = spans.find((s) => s.highlighted)
    expect(highlighted?.text).toBe('hopeless')
    const before = spans[0]!
    expect(before.text).toBe('😀 I feel ')
    expect([...before.text].at(0)).toBe('😀')
  })

  it('keeps a surrogate-pair emoji intact when it sits right after a match', () => {
    const text = 'I feel hopeless 😀 today'
    const spans = computeAttributionSpans(text, [{ token: 'hopeless', attribution: 0.35 }])

    expect(reconstruct(spans)).toBe(text)
    const after = spans.at(-1)!
    expect(after.text).toBe(' 😀 today')
  })

  it('handles a match immediately adjacent to an emoji with no separating space', () => {
    const text = 'hopeless😀'
    const spans = computeAttributionSpans(text, [{ token: 'hopeless', attribution: 0.35 }])

    expect(reconstruct(spans)).toBe(text)
    expect(spans).toEqual([
      { text: 'hopeless', highlighted: true, attribution: 0.35 },
      { text: '😀', highlighted: false, attribution: null }
    ])
  })

  it('matches a token that itself contains an accented character', () => {
    const text = 'I feel like a total échec today'
    const spans = computeAttributionSpans(text, [{ token: 'échec', attribution: 0.2 }])

    expect(reconstruct(spans)).toBe(text)
    expect(spans.find((s) => s.highlighted)?.text).toBe('échec')
  })

  it('round-trips correctly with several emoji and multiple matches mixed together', () => {
    const text = '🎉 hopeless 🚀 and worthless 🌟 too'
    const spans = computeAttributionSpans(text, [
      { token: 'hopeless', attribution: 0.35 },
      { token: 'worthless', attribution: 0.4 }
    ])

    expect(reconstruct(spans)).toBe(text)
    expect(spans.filter((s) => s.highlighted).map((s) => s.text)).toEqual(['hopeless', 'worthless'])
  })
})
