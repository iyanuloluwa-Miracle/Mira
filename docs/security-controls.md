# Security controls

Status: placeholder — to be filled in alongside `server/utils/crypto.ts`, `server/middleware/`,
and `server/utils/rate-limit.ts`.

Documents the technical security controls in this codebase: what they are, why they exist, and
how each is tested. Companion to [privacy-controls.md](privacy-controls.md) and
[ndpa-mapping.md](ndpa-mapping.md).

Expected sections once populated:

- Authentication and session handling (`server/api/auth/`), including the anonymous path
  (FR1, rule R9).
- Encryption at rest: algorithm, key management, and the boot-time check that refuses to start
  without key material (rule R5).
- Input validation: the zod-everywhere policy for server routes and the typed-error contract
  that keeps stack traces and Prisma internals off the client (rule R8).
- Rate limiting (`server/utils/rate-limit.ts`) and what it protects against.
- Audit logging (`server/utils/audit.ts`) — what's recorded for clinician actions on flagged
  cases, and how that differs from the general application log (which the redactor in
  `server/utils/logger.ts` governs per rule R4).
- Dependency and static-analysis scanning: CodeQL (`.github/workflows/codeql.yml`) and
  Dependabot (`.github/dependabot.yml`).
- How to report a vulnerability: see [SECURITY.md](../SECURITY.md).
