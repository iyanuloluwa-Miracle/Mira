# Nigeria Data Protection Act 2023 (NDPA) mapping

Maps NFR1 ("privacy and security aligned to the Nigeria Data Protection Act 2023") to concrete
controls in this codebase, so a reviewer — technical or not — can check the claim of alignment
against actual code rather than taking it on faith. This is a mapping to genuine, cited NDPA
obligations, not a substitute for a real legal compliance review before any real deployment.

Companion to [privacy-controls.md](privacy-controls.md) (the "how it actually works" layer for
the controls named here) and [security-controls.md](security-controls.md).

## Principles (NDPA 2023, s.24)

| Principle                          | Control                                                                                                                                                                              | Implementation                                                                                                                                                           | Test                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Lawfulness, fairness, transparency | Public privacy notice states purpose, lawful basis, categories, retention, and rights in plain language                                                                              | [`app/pages/privacy/index.vue`](../app/pages/privacy/index.vue), copy in [`app/content/copy/privacy.ts`](../app/content/copy/privacy.ts)                                 | Reachable and content-checked in `tests/e2e/privacy.spec.ts`                                                                     |
| Purpose limitation                 | Three separate consent purposes (`SCREENING`, `RESEARCH_LOGGING`, `HUMAN_REVIEW`); data collected under one is not reused under another without its own consent                      | [`server/domain/consent.ts`](../server/domain/consent.ts); enforced at [`server/api/screening/[id]/complete.post.ts`](../server/api/screening/%5Bid%5D/complete.post.ts) | [`server/domain/consent.test.ts`](../server/domain/consent.test.ts)                                                              |
| Data minimisation                  | Pseudonym shown instead of any identifier; email stored as a keyed hash, never plaintext; anonymous use is first-class (rule R9), so most users create no identifiable record at all | [`server/utils/privacy.ts`](../server/utils/privacy.ts) (`hashIdentifier`, `generatePseudonym`)                                                                          | [`server/utils/privacy.test.ts`](../server/utils/privacy.test.ts)                                                                |
| Accuracy                           | Not separately controlled — see "Gaps" below                                                                                                                                         | —                                                                                                                                                                        | —                                                                                                                                |
| Storage limitation                 | Scheduled retention task deletes free text after 90 days, abandoned sessions after 30 days, audit logs after 12 months (all configurable)                                            | [`server/utils/retention.ts`](../server/utils/retention.ts), scheduled in [`nuxt.config.ts`](../nuxt.config.ts), config in [`config/runtime.ts`](../config/runtime.ts)   | [`tests/integration/retention.test.ts`](../tests/integration/retention.test.ts)                                                  |
| Integrity and confidentiality      | AES-256-GCM field encryption for free text, transcripts, clinician notes and emails; keyed hashing for identifiers; log redaction (rule R4)                                          | [`server/utils/crypto.ts`](../server/utils/crypto.ts), [`server/utils/privacy.ts`](../server/utils/privacy.ts), [`server/utils/logger.ts`](../server/utils/logger.ts)    | [`server/utils/crypto.test.ts`](../server/utils/crypto.test.ts), [`server/utils/logger.test.ts`](../server/utils/logger.test.ts) |
| Accountability                     | Append-only `AuditLog` records every clinician action, every DSAR export/deletion, and every retention run                                                                           | [`server/utils/audit.ts`](../server/utils/audit.ts); `prisma/schema.prisma`'s `AuditLog` model                                                                           | Exercised throughout `tests/integration/*.test.ts`                                                                               |

## Data subject rights (NDPA 2023, Part VI)

| Right                               | Control                                                                                                                                                      | Implementation                                                                                                                                                                                                                         | Test                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Right to information                | Public privacy notice, plus a "what is stored" summary specific to this account                                                                              | [`app/pages/privacy/index.vue`](../app/pages/privacy/index.vue); [`server/api/privacy/my-data.get.ts`](../server/api/privacy/my-data.get.ts)                                                                                           | `tests/integration/privacy.test.ts` ("what is stored")                                                                                     |
| Right to access / data portability  | One-click JSON export of everything the summary claims exists, decrypted and human-readable                                                                  | [`server/utils/dsar.ts`](../server/utils/dsar.ts)'s `exportUserData`; [`server/api/privacy/export.get.ts`](../server/api/privacy/export.get.ts)                                                                                        | `tests/integration/privacy.test.ts` ("export ... contains everything the summary claims exists")                                           |
| Right to object / withdraw consent  | Per-purpose toggle, effective immediately on the next check of that purpose, with the practical effect stated in plain language before the person toggles it | [`server/api/privacy/consent.post.ts`](../server/api/privacy/consent.post.ts); dashboard at [`app/pages/privacy/my-data.vue`](../app/pages/privacy/my-data.vue)                                                                        | `tests/integration/privacy.test.ts` ("withdrawing consent takes effect immediately"); `tests/integration/clinician.test.ts` (HUMAN_REVIEW) |
| Right to erasure                    | Real, cascading hard delete of the account and every row that traces back to it, gated on typing the account's own pseudonym                                 | [`server/utils/dsar.ts`](../server/utils/dsar.ts)'s `eraseUserData`; [`server/api/privacy/delete-account.post.ts`](../server/api/privacy/delete-account.post.ts); cascades declared with `onDelete: Cascade` in `prisma/schema.prisma` | `tests/integration/privacy.test.ts` ("a direct database query returns zero rows ... across every linked table")                            |
| Right to restrict processing        | Not implemented — see "Gaps" below                                                                                                                           | —                                                                                                                                                                                                                                      | —                                                                                                                                          |
| Right to rectification / correction | Not implemented as a standalone control — see "Gaps" below                                                                                                   | —                                                                                                                                                                                                                                      | —                                                                                                                                          |

## Anonymous processing and rule R9

Most of what NDPA regulates presumes the data controller can identify the data subject. A large
share of Mira's users never create an identifiable record at all: `User.authMode` defaults to
`ANONYMOUS`, no email is collected, and the pseudonym
([`server/utils/privacy.ts`](../server/utils/privacy.ts)'s `generatePseudonym`) is generated
locally, not derived from anything about the person. For this population, several NDPA
obligations that presume identifiability (e.g. rectification of "your" record, or a subject
access request tied to a known identity) are structurally reduced, not because the app dodges
them, but because there is no identifying data to act on in the first place — the pseudonym in
the cookie is the only handle that exists, and the export/erasure flows work from that handle
alone, with no separate identity-verification step required or possible.

## Honest gaps

An examiner will trust a candid account of what is not yet done more than a table of ticks. These
are real, current gaps, not hypothetical future work being pre-emptively excused:

- **`SCREENING` consent is recorded but never checked.** The consent API accepts and stores a
  grant/withdrawal for the `SCREENING` purpose (`ConsentPurpose.SCREENING` in
  `prisma/schema.prisma`), and the dashboard shows and lets a person toggle it
  (`app/pages/privacy/my-data.vue`), but no server code currently gates any behaviour on its
  value — screening is reachable regardless (by design, rule R9: screening is never gated on
  registration or consent-of-any-kind being a blocker). The dashboard's own copy
  (`CONSENT_PURPOSE_EFFECTS.SCREENING` in `app/content/copy/privacy.ts`) says this outright
  rather than implying a control that doesn't exist. If a future requirement needs screening
  itself to be consent-gated, this is the flag that it currently is not.
- **`AuditLog` rows are not erased on account deletion, and have no foreign key to `User` at
  all.** `server/utils/dsar.ts`'s `eraseUserData` deletes the `User` row and everything that
  cascades from it, but a person's own past `AuditLog` entries (e.g. `DATA_EXPORTED`,
  `ACCOUNT_DELETED`) remain, keyed by a bare `actorId` string that no longer resolves to
  anything. This is a deliberate choice, not an oversight: `AuditLog.metadataJson` is
  disciplined (by convention and review, rule R4) to never carry PHI or free text, so the
  append-only integrity of the accountability trail was judged to outweigh minimising an
  orphaned identifier. It is, however, a genuine (small) tension with a strict reading of the
  right to erasure, and is recorded here rather than glossed over.
- **No right to restriction of processing.** Mira offers full erasure or per-purpose consent
  withdrawal, not an intermediate "keep the data but stop processing it" state. Implementing
  this would need a new per-record status (distinct from `EscalationStatus` and
  `SessionStatus`) that every read path respects, and hasn't been built.
- **No right to rectification.** There is no route to correct a stored answer or a computed
  score. The only way to change a wrong answer today is to delete the affected session
  (`server/api/screening/[id].delete.ts`) and screen again — acceptable as a workaround, not the
  same as a rectification right.
- **No named data controller or verified contact address.** This is a thesis research prototype,
  not a deployed service (rule R10: no real contact details are committed to a public repo
  pending verification). `NOTICE_CONTACT_BODY` in `app/content/copy/privacy.ts` says this
  directly rather than fabricating a plausible-looking contact.
- **Breach notification is a documented process gap, not a code gap.** NDPA requires notifying
  the Commission and, where risk is high, affected persons, within a defined window of becoming
  aware of a breach. Nothing in this codebase detects or triggers that process — it is
  organisational, and for a thesis prototype with no real user data (rule R10), no such process
  has been established. A real deployment would need one before going live, independent of any
  code in this repository.
- **Accuracy** (the principle, not a named subject right) has no dedicated control. Screening
  answers and computed scores are taken as given at the moment of submission; nothing here
  attempts to verify or challenge their correctness, nor lets a clinician annotate a record as
  disputed.

## Cross-references

- Encryption, hashing, and log redaction: [privacy-controls.md](privacy-controls.md).
- Consent-gated escalation visibility (the `HUMAN_REVIEW` purpose specifically):
  [privacy-controls.md](privacy-controls.md)'s "Consent-gated escalation" row.
- Session/authentication security: [security-controls.md](security-controls.md).
