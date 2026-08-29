import { describe, expect, it } from 'vitest'
import {
  canCreateEscalationRecord,
  canRevealFreeTextToClinician,
  hasActiveConsent,
  type ConsentRecordLike
} from './consent'

function record(overrides: Partial<ConsentRecordLike> = {}): ConsentRecordLike {
  return { purpose: 'HUMAN_REVIEW', granted: true, withdrawnAt: null, ...overrides }
}

describe('hasActiveConsent', () => {
  it('is false with no records at all', () => {
    expect(hasActiveConsent([], 'HUMAN_REVIEW')).toBe(false)
  })

  it('is true for a granted, unwithdrawn record of the matching purpose', () => {
    expect(hasActiveConsent([record()], 'HUMAN_REVIEW')).toBe(true)
  })

  it('is false when the only record is a different purpose', () => {
    expect(hasActiveConsent([record({ purpose: 'SCREENING' })], 'HUMAN_REVIEW')).toBe(false)
  })

  it('is false when the record was granted but later withdrawn', () => {
    expect(hasActiveConsent([record({ withdrawnAt: new Date() })], 'HUMAN_REVIEW')).toBe(false)
  })

  it('is false when the record exists but granted is false (an explicit decline)', () => {
    expect(hasActiveConsent([record({ granted: false })], 'HUMAN_REVIEW')).toBe(false)
  })

  it('is true when a withdrawn row is followed by a fresh grant (withdraw-then-regrant)', () => {
    const records = [record({ withdrawnAt: new Date('2026-01-01') }), record({ withdrawnAt: null })]
    expect(hasActiveConsent(records, 'HUMAN_REVIEW')).toBe(true)
  })

  it('only matches the requested purpose among several', () => {
    const records = [record({ purpose: 'SCREENING' }), record({ purpose: 'RESEARCH_LOGGING' })]
    expect(hasActiveConsent(records, 'HUMAN_REVIEW')).toBe(false)
    expect(hasActiveConsent(records, 'SCREENING')).toBe(true)
  })
})

describe('canCreateEscalationRecord', () => {
  it('is true only with active HUMAN_REVIEW consent', () => {
    expect(canCreateEscalationRecord([record()])).toBe(true)
    expect(canCreateEscalationRecord([])).toBe(false)
    expect(canCreateEscalationRecord([record({ withdrawnAt: new Date() })])).toBe(false)
  })

  it('is not satisfied by consent for a different purpose', () => {
    expect(canCreateEscalationRecord([record({ purpose: 'RESEARCH_LOGGING' })])).toBe(false)
  })
})

describe('canRevealFreeTextToClinician', () => {
  it('is true only with active HUMAN_REVIEW consent', () => {
    expect(canRevealFreeTextToClinician([record()])).toBe(true)
    expect(canRevealFreeTextToClinician([])).toBe(false)
  })

  it('stops being true the moment the record is withdrawn, independent of escalation creation', () => {
    // Simulates: consent was active when the Escalation row was created, then withdrawn later.
    // canCreateEscalationRecord would have been true at creation time; this checks the live
    // state a clinician's read sees now, which must reflect the withdrawal immediately.
    const recordsAfterWithdrawal = [record({ withdrawnAt: new Date() })]
    expect(canRevealFreeTextToClinician(recordsAfterWithdrawal)).toBe(false)
  })
})
