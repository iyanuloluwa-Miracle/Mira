# Nigeria Data Protection Act 2023 (NDPA) mapping

Status: placeholder — to be filled in as `server/utils/privacy.ts`, `server/utils/dsar.ts`, and
the consent flow (`app/components/privacy/`, `server/api/privacy/`) are built out.

Maps NFR1 ("privacy and security aligned to the Nigeria Data Protection Act 2023") to concrete
controls in this codebase, so a reviewer — technical or not — can check the claim of alignment
against actual code rather than taking it on faith. This is a mapping to genuine, cited NDPA
obligations, not a substitute for a real legal compliance review before any real deployment.

Expected sections once populated, each pointing at the specific NDPA provision and the code or
process that implements it:

- Lawful basis and consent capture (`app/components/privacy/`, `server/api/privacy/`).
- Data minimisation — why each field in `prisma/schema.prisma` is collected.
- Anonymous processing path and how it reduces obligations tied to identifiable data (rule R9).
- Storage limitation / retention (`server/tasks/`).
- Security of processing: encryption at rest (rule R5), logging redaction (rule R4),
  cross-referenced with [security-controls.md](security-controls.md).
- Data subject rights (access, correction, deletion) and how `server/utils/dsar.ts` implements
  them.
- Breach-notification process (organisational, not just code — document the process even if it
  has no corresponding file).
