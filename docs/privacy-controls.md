# Privacy controls

Companion to [ndpa-mapping.md](ndpa-mapping.md) (which maps controls to specific legal
obligations) and [security-controls.md](security-controls.md) (security controls that back
privacy in practice). This document is the "how it actually works" layer — each control below
is implemented, unit tested, and traceable to source.

## Controls

| Control                                                                                                                                                                                        | NDPA principle                                   | Implementation                                                                                                                                                             | Tests                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| AES-256-GCM field encryption (`encryptField` / `decryptField`)                                                                                                                                 | Integrity and confidentiality                    | [`server/utils/crypto.ts`](../server/utils/crypto.ts)                                                                                                                      | [`server/utils/crypto.test.ts`](../server/utils/crypto.test.ts)                                              |
| Boot-time encryption key check — the app refuses to start without valid key material (`assertEncryptionKeyPresent`)                                                                            | Integrity and confidentiality                    | [`server/utils/crypto.ts`](../server/utils/crypto.ts); installed at startup by [`server/plugins/verify-encryption-key.ts`](../server/plugins/verify-encryption-key.ts)     | [`server/utils/crypto.test.ts`](../server/utils/crypto.test.ts)                                              |
| Keyed HMAC-SHA256 identifier hashing (`hashIdentifier`) — email and IP are never stored in plaintext                                                                                           | Data minimisation; Integrity and confidentiality | [`server/utils/privacy.ts`](../server/utils/privacy.ts); backs `User.emailHash` and `ConsentRecord.ipHash` in [`prisma/schema.prisma`](../prisma/schema.prisma)            | [`server/utils/privacy.test.ts`](../server/utils/privacy.test.ts)                                            |
| Pseudonym generation (`generatePseudonym`) — the only identifier ever shown back to a person or a clinician                                                                                    | Data minimisation; Purpose limitation            | [`server/utils/privacy.ts`](../server/utils/privacy.ts); backs `User.pseudonym`                                                                                            | [`server/utils/privacy.test.ts`](../server/utils/privacy.test.ts)                                            |
| Denylist-based log redaction (`redactForLogs`) — strips `text`, `response`, `message`, `email`, `ip`, `token`, `answer`, `transcript` at any depth, case-insensitively, and truncates the rest | Integrity and confidentiality; Data minimisation | [`server/utils/privacy.ts`](../server/utils/privacy.ts), applied by every call through [`server/utils/logger.ts`](../server/utils/logger.ts)                               | [`server/utils/privacy.test.ts`](../server/utils/privacy.test.ts)                                            |
| Global console redaction safety net (`installConsoleRedaction`) — catches a stray `console.log` that bypassed `logger`                                                                         | Integrity and confidentiality                    | [`server/utils/logger.ts`](../server/utils/logger.ts); installed at startup by [`server/plugins/redact-console-logs.ts`](../server/plugins/redact-console-logs.ts)         | [`server/utils/logger.test.ts`](../server/utils/logger.test.ts)                                              |
| Separate secrets for encryption vs. hashing (`ENCRYPTION_KEY` vs `IDENTIFIER_HASH_PEPPER`) — a leaked pepper can't be used to decrypt free text and vice versa                                 | Integrity and confidentiality                    | [`.env.example`](../.env.example)                                                                                                                                          | Exercised implicitly — the two test suites above set the two env vars independently and never cross-use them |
| Immediate per-session deletion — a person can delete one screening session's answers, triage result, and escalation the moment they see the result, without waiting on a full DSAR             | Storage limitation; Right to erasure             | [`server/api/screening/[id].delete.ts`](../server/api/screening/%5Bid%5D.delete.ts); cascades via `onDelete: Cascade` in [`prisma/schema.prisma`](../prisma/schema.prisma) | [`tests/integration/screening.test.ts`](../tests/integration/screening.test.ts)                              |

## Design notes

**Why encryption and hashing use different secrets.** `ENCRYPTION_KEY` (AES-256-GCM, reversible
with the key) and `IDENTIFIER_HASH_PEPPER` (HMAC-SHA256, one-way) protect different things for
different reasons: free text needs to be recoverable by the app (to show a result, to feed the
classifier) so it's encrypted; an email only ever needs to be _matched_, never displayed back,
so it's hashed instead. Keeping the secrets separate means a compromise of one doesn't also
compromise the other.

**Why `hashIdentifier` normalizes input.** Trimming and lowercasing before hashing means
`User@Example.com` and `user@example.com` hash identically, which is what lets a login lookup
by email work at all without ever storing the email itself.

**Why `redactForLogs` truncates in addition to denylisting.** The denylist catches known-risky
field names. Truncation is the fallback for everything else: a field nobody thought to denylist
that happens to be unexpectedly long is still capped, limiting how much can leak through a gap
in the denylist rather than relying on the denylist being perfect.

**Why redaction is enforced twice.** `logger.ts`'s `info`/`warn`/`error` functions are the
intended path for all application logging, but rule R4 ("no plaintext free text, chat content,
identifier or token may enter a log line") is severe enough to warrant a second, independent
layer: `installConsoleRedaction` patches the global `console` object itself, so even a bare
`console.log(someObject)` written by a future contributor who didn't know about `logger.ts`
still gets redacted. Defense in depth, not a substitute for using `logger.ts` directly.

## What isn't covered here yet

Honestly, on purpose — these land in later prompts, not silently skipped:

- **Storage limitation** (the fourth principle named in the brief for this document) isn't
  represented by a control above. Encryption at rest protects confidentiality of data that
  exists; it says nothing about _how long_ it exists. Retention and deletion jobs
  (`server/tasks/`) and the DSAR export/erasure flow (`server/utils/dsar.ts`) are what actually
  implement storage limitation, and they're scoped to later prompts.
- **Purpose limitation** for consent itself — i.e., enforcing that data collected for
  `SCREENING` isn't reused for `RESEARCH_LOGGING` without separate consent — depends on the
  consent-gating logic in the auth/consent flow (prompt 4), not on anything in this file.
- Full [ndpa-mapping.md](ndpa-mapping.md) coverage of every NDPA obligation is still a
  placeholder; it gets filled in incrementally as each of the above lands, not all at once here.
