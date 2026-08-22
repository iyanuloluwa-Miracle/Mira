import { describe, expect, it } from 'vitest'
import { GAD7_ITEMS, type Gad7ItemCode } from './instruments/gad7'
import { PHQ9_ITEM_NINE_CODE, PHQ9_ITEMS, type Phq9ItemCode } from './instruments/phq9'
import { IncompleteResponseError, InvalidResponseValueError, scoreGad7, scorePhq9 } from './scoring'

const PHQ9_CODES = PHQ9_ITEMS.map((item) => item.itemCode)
const GAD7_CODES = GAD7_ITEMS.map((item) => item.itemCode)

// Greedily fills each item with as much of `total` as it can take (max 3), left to right, so
// the resulting responses sum to exactly `total`. Deterministic and easy to hand-verify — e.g.
// distribute(9 items, 20) => six 3s (18) + one 2 + two 0s = 20 across 9 items.
function distribute<Code extends string>(
  itemCodes: readonly Code[],
  total: number
): Record<Code, number> {
  let remaining = total
  const entries = itemCodes.map((code) => {
    const value = Math.max(0, Math.min(3, remaining))
    remaining -= value
    return [code, value] as const
  })
  if (remaining !== 0) {
    throw new Error(`distribute: total ${total} is not achievable across ${itemCodes.length} items`)
  }
  return Object.fromEntries(entries) as Record<Code, number>
}

function phq9Responses(total: number): Partial<Record<Phq9ItemCode, number>> {
  return distribute(PHQ9_CODES, total)
}

function gad7Responses(total: number): Partial<Record<Gad7ItemCode, number>> {
  return distribute(GAD7_CODES, total)
}

// Every other item fixed at `otherItemsValue`, item 9 fixed independently — isolates the
// item-9 flag from whatever the overall total happens to be, since the two aren't related.
function phq9ResponsesWithItemNine(
  itemNineValue: number,
  otherItemsValue = 0
): Partial<Record<Phq9ItemCode, number>> {
  const responses = Object.fromEntries(
    PHQ9_CODES.map((code) => [code, otherItemsValue])
  ) as Partial<Record<Phq9ItemCode, number>>
  responses[PHQ9_ITEM_NINE_CODE] = itemNineValue
  return responses
}

describe('scorePhq9', () => {
  it.each([
    [0, 'MINIMAL'],
    [4, 'MINIMAL'],
    [5, 'MILD'],
    [9, 'MILD'],
    [10, 'MODERATE'],
    [14, 'MODERATE'],
    [15, 'MODERATELY_SEVERE'],
    [19, 'MODERATELY_SEVERE'],
    [20, 'SEVERE'],
    [27, 'SEVERE']
  ] as const)('total %i maps to band %s', (total, expectedBand) => {
    const result = scorePhq9(phq9Responses(total))
    expect(result.total).toBe(total)
    expect(result.band).toBe(expectedBand)
  })

  it('flags item 9 answered above zero, regardless of the overall total', () => {
    expect(scorePhq9(phq9ResponsesWithItemNine(0)).itemNineElevated).toBe(false)
    expect(scorePhq9(phq9ResponsesWithItemNine(1)).itemNineElevated).toBe(true)
    expect(scorePhq9(phq9ResponsesWithItemNine(2)).itemNineElevated).toBe(true)
    expect(scorePhq9(phq9ResponsesWithItemNine(3)).itemNineElevated).toBe(true)
  })

  it('does not flag item 9 when it is exactly zero, even with every other item at maximum', () => {
    const result = scorePhq9(phq9ResponsesWithItemNine(0, 3))
    expect(result.itemNineElevated).toBe(false)
    expect(result.total).toBe(24) // 8 other items x 3, item 9 at 0
  })

  it('throws IncompleteResponseError when an item is missing', () => {
    const responses = phq9Responses(9)
    delete responses.PHQ9_Q3
    expect(() => scorePhq9(responses)).toThrow(IncompleteResponseError)
  })

  it('names every missing item in IncompleteResponseError', () => {
    const responses = phq9Responses(9)
    delete responses.PHQ9_Q3
    delete responses.PHQ9_Q7
    try {
      scorePhq9(responses)
      expect.unreachable('expected scorePhq9 to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(IncompleteResponseError)
      expect((error as Error).message).toContain('PHQ9_Q3')
      expect((error as Error).message).toContain('PHQ9_Q7')
    }
  })

  it('rejects an empty submission entirely, not a zero score', () => {
    expect(() => scorePhq9({})).toThrow(IncompleteResponseError)
  })

  it.each([-1, 4, 100])('throws InvalidResponseValueError for out-of-range value %i', (value) => {
    const responses = phq9Responses(9)
    responses.PHQ9_Q1 = value
    expect(() => scorePhq9(responses)).toThrow(InvalidResponseValueError)
  })

  it('throws InvalidResponseValueError for a non-integer value', () => {
    const responses = phq9Responses(9)
    responses.PHQ9_Q1 = 1.5
    expect(() => scorePhq9(responses)).toThrow(InvalidResponseValueError)
  })

  it('does not score partially when one item is out of range', () => {
    const responses = phq9Responses(9)
    responses.PHQ9_Q1 = 99
    expect(() => scorePhq9(responses)).toThrow()
  })

  it('is pure: identical input produces identical output across calls', () => {
    const responses = phq9Responses(14)
    expect(scorePhq9(responses)).toEqual(scorePhq9(responses))
  })

  it('does not mutate its input', () => {
    const responses = Object.freeze(phq9Responses(14))
    expect(() => scorePhq9(responses)).not.toThrow()
  })
})

describe('scoreGad7', () => {
  it.each([
    [0, 'MINIMAL'],
    [4, 'MINIMAL'],
    [5, 'MILD'],
    [9, 'MILD'],
    [10, 'MODERATE'],
    [14, 'MODERATE'],
    [15, 'SEVERE'],
    [21, 'SEVERE']
  ] as const)('total %i maps to band %s', (total, expectedBand) => {
    const result = scoreGad7(gad7Responses(total))
    expect(result.total).toBe(total)
    expect(result.band).toBe(expectedBand)
  })

  it('throws IncompleteResponseError when an item is missing', () => {
    const responses = gad7Responses(9)
    delete responses.GAD7_Q2
    expect(() => scoreGad7(responses)).toThrow(IncompleteResponseError)
  })

  it('rejects an empty submission entirely, not a zero score', () => {
    expect(() => scoreGad7({})).toThrow(IncompleteResponseError)
  })

  it.each([-1, 4, 100])('throws InvalidResponseValueError for out-of-range value %i', (value) => {
    const responses = gad7Responses(9)
    responses.GAD7_Q1 = value
    expect(() => scoreGad7(responses)).toThrow(InvalidResponseValueError)
  })

  it('throws InvalidResponseValueError for a non-integer value', () => {
    const responses = gad7Responses(9)
    responses.GAD7_Q1 = 2.5
    expect(() => scoreGad7(responses)).toThrow(InvalidResponseValueError)
  })

  it('is pure: identical input produces identical output across calls', () => {
    const responses = gad7Responses(10)
    expect(scoreGad7(responses)).toEqual(scoreGad7(responses))
  })

  it('does not mutate its input', () => {
    const responses = Object.freeze(gad7Responses(10))
    expect(() => scoreGad7(responses)).not.toThrow()
  })

  it('has no item-9 concept — GAD-7 has only 7 items', () => {
    expect(GAD7_CODES).toHaveLength(7)
  })
})
