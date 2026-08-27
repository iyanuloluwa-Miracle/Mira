// [NFR1] Pure consent-state logic — what consent is required before which action, and how to
// read "is this consent currently active" from a purpose's decision history. Recording and
// persisting a consent decision belongs in server/api/privacy; this file only ever answers
// yes/no questions about consent records the caller has already loaded, the same zero-import
// discipline as triage.ts and resources.ts.

// [FR6][NFR1] The version recorded against a HUMAN_REVIEW grant made through the referral
// screen's "share with a clinician" action (server/api/screening/[id]/escalate.post.ts) — bump
// this if that screen's explanation of what a clinician will and will not see changes in any
// way that would matter to what someone is agreeing to.
export const HUMAN_REVIEW_CONSENT_VERSION = '1'

export interface ConsentRecordLike {
  purpose: string
  granted: boolean
  withdrawnAt: Date | null
}

// A withdrawal always closes out the one row it withdraws — server/api/privacy/consent.post.ts
// updates that row's withdrawnAt in place rather than creating a second row for it — so at most
// one row can ever be "granted and not withdrawn" for a given (user, purpose) pair at once.
// Checking the whole history for one such row is equivalent to, and simpler than, requiring
// every caller to first find "the most recent row" themselves.
export function hasActiveConsent(records: readonly ConsentRecordLike[], purpose: string): boolean {
  return records.some(
    (record) => record.purpose === purpose && record.granted && record.withdrawnAt === null
  )
}

// [FR6][NFR1] The consent-aware escalation branch, made explicit and named rather than an
// inline `if` inside a route handler: an escalate-worthy triage result becomes an identifiable
// Escalation row a clinician can see if and only if the person has active HUMAN_REVIEW consent
// at the moment this is checked. If not, the person still sees the referral screen and
// helplines — server/api/screening/[id]/complete.post.ts and result.get.ts never gate those on
// consent, only the clinician-visible record is withheld.
export function canCreateEscalationRecord(records: readonly ConsentRecordLike[]): boolean {
  return hasActiveConsent(records, 'HUMAN_REVIEW')
}

// [FR7][NFR1] A second, independent check at read time, not creation time: a clinician's
// escalation detail view re-checks *current* HUMAN_REVIEW consent before showing free text, so
// a withdrawal after an Escalation row already exists immediately stops surfacing it. This is
// checked separately from canCreateEscalationRecord above — even though both currently read the
// same purpose — because they answer different questions at different points in time: "should
// this case ever have entered the queue" versus "can free text be shown on it right now."
export function canRevealFreeTextToClinician(records: readonly ConsentRecordLike[]): boolean {
  return hasActiveConsent(records, 'HUMAN_REVIEW')
}
