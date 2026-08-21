# CLAUDE.md

Working context for anyone (human or Claude) making changes to Mira. Read this before
touching anything in `server/domain/`, `server/utils/`, `app/content/copy/`, or `config/`.

## What this system is

Mira is a privacy-preserving, mobile-first web application that screens adults for symptoms
of depression and anxiety using validated instruments, computes a risk level, and routes the
person either to psychoeducational resources or to human support. It is built for a Nigerian
low-resource context: cheap Android devices, expensive and unreliable data, and a strong
documented reluctance to disclose mental health difficulty.

**It is a screening and decision-support tool. It is not diagnostic, not therapeutic, and not
a crisis service.** Every design decision defers to that positioning. When a change could be
read as making a stronger clinical claim than "this may indicate," it is out of scope without
explicit sign-off.

## The five components, in order of authority

Authority order matters: a lower-numbered component can never be overridden by a
higher-numbered one.

1. **Screening engine** — administers PHQ-9 and GAD-7 exactly as validated, scores them, bands
   them. `server/domain/scoring.ts`, `server/domain/instruments/`.
2. **Triage and safety-routing engine** — deterministic rules that turn scores into a risk
   level and an escalation decision. `server/domain/triage.ts`, `server/domain/safety.ts`.
3. **NLP classifier** — a fine-tuned transformer analysing optional free text as a
   _supplementary signal only_. `services/classifier/`, `server/services/classifier/`.
4. **Bounded conversational layer** — psychoeducation and score explanation. Subordinate. Has
   no authority over any clinical outcome. `server/services/conversation/`,
   `app/components/conversation/`.
5. **Clinician review interface** — where escalated cases surface for human follow-up.
   `app/pages/clinician/`, `app/components/clinician/`, `server/api/clinician/`.

## Requirements

Every module implementing a requirement carries a comment tag, e.g. `// [FR4]` or `// [NFR1]`.
`scripts/generate-traceability.ts` builds `docs/traceability-matrix.md` from these tags plus
test metadata — never hand-edit that file.

**Functional**

- FR1 Secure registration and authentication, including a first-class anonymous path.
- FR2 Administer PHQ-9 and GAD-7.
- FR3 Analyse free-text input with NLP to support screening.
- FR4 Compute a risk level and produce a triage decision.
- FR5 Serve psychoeducational resources.
- FR6 Escalate cases above a risk threshold to human support.
- FR7 Clinician/admin review of flagged cases and resource management.

**Non-functional**

- NFR1 Privacy and security aligned to the Nigeria Data Protection Act 2023.
- NFR2 Usable on low-cost smartphones.
- NFR3 Screening results returned within a defined, measured latency.
- NFR4 Reliable and available under expected load.
- NFR5 Screening outputs accompanied by interpretable rationale.
- NFR6 Architecture supports growth without redesign.

## Non-negotiable engineering rules

These are safety rules, not style preferences. Do not relax them for convenience, and do not
"improve" them in a later session without an ADR and clinical sign-off.

- **R1** Triage and safety decisions are deterministic rule code. No model output — classifier
  or LLM — may ever decide, lower, or override a risk band. The classifier may raise a band by
  at most one step and must record that it did so.
- **R2** PHQ-9 item 9 answered above zero forces CRISIS, unconditionally, ahead of every other
  rule.
- **R3** The crisis pathway is static, pre-written, clinician-reviewed copy. No generated text,
  no network dependency, reachable from every screen without a loading state.
- **R4** No plaintext free text, chat content, identifier or token may enter a log line. The
  logger is wrapped in a redactor and the redactor is tested.
- **R5** Free text and clinician notes are encrypted at rest with AES-256-GCM. Emails are
  stored as keyed hashes. The app refuses to boot without its key material.
- **R6** The LLM never diagnoses, never names a disorder as a conclusion about the user, never
  gives medication or dosage information, never issues crisis instructions of its own, never
  claims to be a clinician. Enforced by a deterministic pre-filter and an output post-filter,
  not by the system prompt alone.
- **R7** Screening must complete successfully when the classifier and the LLM are both
  unreachable. Degrade, state the degradation to the user, never fail.
- **R8** Every server route validates input with zod, rejects unknown keys, and returns a
  typed error. Never leak stack traces, Prisma errors or constraint names to the client.
- **R9** Anonymous use is never gated behind registration anywhere in the screening flow.
- **R10** No real participant data, no real secrets, no real helpline numbers pending
  verification, and no thesis PDF ever enter this repository. It is public.

## Directory structure and its rules

```
app/            Nuxt 4 client: pages, components, composables. No secrets, no direct
                third-party or database calls.
server/         Nitro server: API routes, pure domain logic, service adapters, utilities.
server/domain/  Pure functions and types only — no Nuxt, Nitro, Prisma, or service imports.
                This is what makes safety logic testable and auditable in isolation.
server/services/ The only place that performs network I/O to third parties.
app/components/ui/ Presentational primitives with no domain knowledge.
prisma/         Schema and migrations.
services/classifier/ Standalone Python FastAPI inference service.
content/resources/  Front-mattered psychoeducational markdown.
config/         Non-secret configuration, e.g. helpline numbers pending verification.
tests/          e2e, fixtures (synthetic only), integration, unit.
docs/           architecture, data model, privacy/security controls, ADRs.
```

Structural rules:

- `server/domain/` imports nothing from Nuxt, Nitro, Prisma or any service.
- `server/services/` is the only place that performs network I/O to third parties.
- `app/components/ui/` holds presentational primitives with no domain knowledge.
- No file over roughly 300 lines. Split by responsibility, not by arbitrary line count.
- Barrel `index.ts` files only where they genuinely reduce import noise.

## Before you finish any task

- [ ] Tests written for new or changed logic, especially anything in `server/domain/` or
      `server/utils/`.
- [ ] Requirement tag (`// [FR#]` / `// [NFR#]`) added to modules implementing a requirement.
- [ ] No secret, API key, real helpline number, participant data, or thesis PDF committed.
- [ ] No plaintext free text, chat content, identifier or token passed to the logger directly
      — it goes through the redactor in `server/utils/logger.ts`.
- [ ] Docs updated if the change affects architecture, data model, or a control described in
      `docs/`.
- [ ] If the change touches `server/domain/triage.ts`, `server/domain/safety.ts`,
      `config/helplines.ts`, or `app/content/copy/`, it is flagged for clinical review per
      CONTRIBUTING.md — do not merge it solely on engineering review.
