# Data model

Status: placeholder — to be filled in as `prisma/schema.prisma` grows past its initial stub.

The single source of truth for persisted shapes is [`prisma/schema.prisma`](../prisma/schema.prisma).
This document exists to explain the _why_ behind that schema — relationships, retention, and
encryption boundaries — in a way a raw schema file can't. It should cover, at minimum:

- The account model, including the anonymous-identity path (FR1, rule R9) and how an anonymous
  session can later (optionally) be linked to a registered account.
- Screening session, response, and score entities, and which fields are encrypted at rest
  (rule R5) versus stored as plain relational data.
- How the triage result distinguishes the rule-based outcome from any classifier-driven band
  increase (see [decisions/0001-rule-based-triage.md](decisions/0001-rule-based-triage.md)).
- Clinician and resource-management entities backing FR7.
- Retention periods and how `server/tasks/` enforces them, per the NDPA mapping in
  [ndpa-mapping.md](ndpa-mapping.md).

Keep this document in sync with the schema; a stale data model doc is worse than none.
