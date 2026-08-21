# Privacy controls

Status: placeholder — to be filled in alongside the privacy-related modules under `server/`.

Describes the technical controls that implement Mira's privacy posture, as a companion to
[ndpa-mapping.md](ndpa-mapping.md) (which maps controls to specific legal obligations) and
[security-controls.md](security-controls.md) (which covers the security controls that back
privacy in practice). This document is the "how it actually works" layer.

Expected sections once populated:

- The anonymous-use path end to end: what is and isn't collected when no account exists
  (rule R9).
- Encryption at rest for free text and clinician notes, and email hashing (rule R5) —
  what's encrypted, with what, and where the key material lives.
- Logging redaction (rule R4): what the redactor in `server/utils/logger.ts` strips, and how
  its test suite proves it.
- Data retention and deletion (`server/tasks/`), and the DSAR flow (`server/utils/dsar.ts`,
  `server/api/privacy/`).
- Third-party data flows: exactly what leaves the system boundary when the classifier or LLM
  services are called, and what doesn't.
