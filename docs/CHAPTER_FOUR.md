# CHAPTER FOUR

## SYSTEM IMPLEMENTATION, EXPERIMENTATION, RESULTS AND DISCUSSION

> **Generation record.** This chapter is derived from `docs/chapter-four-draft.md`, which was
> drafted 2026-08-30 against commit `3c979e6557cee5890a4f8a0b21fb4230dc5a89a2` (branch `dev`,
> working tree clean at generation time) by running the commands listed below, in order, against
> that commit. It was reformatted into this file on 2026-08-31 against the current `dev` HEAD,
> commit `70be900`. Between those two commits, `git diff --stat 3c979e6 HEAD` shows changes only
> to Docker removal, local-setup documentation, the demo seed script, the evidence-capture script,
> and setup tooling (`README.md`, `docs/local-setup.md`, `prisma/demo-seed.ts`,
> `scripts/capture-evidence.ts`, `scripts/setup.ts`, and related files) — **no file under
> `server/domain/`, `server/api/`, `server/services/`, `app/`, or `tests/` changed**. Every test
> count, coverage figure, and requirement-verification result below therefore still describes the
> code at current HEAD accurately; only the [DATA REQUIRED] items (screenshots, classifier
> training results, usability data) remain genuinely unproduced, confirmed by inspection of
> `docs/screenshots/` (contains only `README.md`) and the absence of `FIGURES.md` or a
> `data/evaluation-export/` directory in the repository as of this writing. Figures were produced
> by, in order:
>
> - `npm run test:coverage` (`vitest run --coverage server app tests/unit` +
>   `tsx scripts/check-coverage-thresholds.ts`) — unit test counts, pass/fail, and per-file
>   coverage for `server/domain` and `server/utils`.
> - `npm run test:integration` (`vitest run tests/integration --pool=threads
--poolOptions.threads.singleThread`) — integration test counts and pass/fail.
> - `npx playwright test` — full end-to-end suite, run three times; the first two discarded as
>   confounded, the third (`CI=1`, no concurrent database activity) reported in §4.5.3.
> - A direct `SELECT ... percentile_cont(...) FROM metrics GROUP BY name` / `GROUP BY "riskLevel"`
>   query against the project's development Postgres database — §4.7's latency and
>   triage-distribution figures.
> - `docs/traceability-matrix.md`, generated 2026-08-30T15:13:24.970Z by
>   `scripts/generate-traceability.ts` (never hand-edited) from `// [FR#]` / `// [NFR#]` tags plus
>   a full unit+integration+e2e run, quoted verbatim in §4.4.
> - Reading of `docs/architecture.md`, `docs/decisions/0001-rule-based-triage.md`,
>   `docs/llm-safety-tests.md`, `docs/frontend-metrics.md`, `docs/ndpa-mapping.md`,
>   `docs/security-controls.md`, `docs/privacy-controls.md`,
>   `docs/evaluation-data-dictionary.md`, `docs/local-setup.md`, `CONTRIBUTING.md`,
>   `coverage-thresholds.json`, `package.json`, and the source files cited inline.
>
> If further prompts are implemented after commit `70be900`, re-run these commands and regenerate
> before citing this chapter's figures — they are frozen to the commits named above, not to
> "the current state of the repository" at the time of reading.

### 4.1 Introduction

This chapter presents what was actually built and measured for the MVP1 implementation of Mira,
the privacy-preserving mental health screening, triage, and psychoeducational support system
specified in Chapter Three. It is organised around the same five-component architecture used
throughout this thesis — the screening engine, the triage and safety-routing engine, the NLP
classifier integration, the bounded conversational layer, and the clinician review interface —
together with the cross-cutting evidence a thesis examiner would expect: a description of the
development environment, requirement-by-requirement verification, functional test results, an
adversarial evaluation of the conversational layer's safety guardrails, performance measurements,
and a privacy and security assessment against the Nigeria Data Protection Act 2023.

The chapter's single governing rule is traceability: every number, claim, and figure reported
here is derived from something in the project repository — a test run, a coverage report, a
database query, a source file, or a generated document — and never from an illustrative estimate.
Three categories of result named in the original evaluation plan — the trained NLP classifier's
accuracy metrics (§4.9), the post-use usability questionnaire (§4.10), and screen captures of the
interface (§4.3) — had not yet been produced at the time of writing. Rather than omit them or
fill them with placeholder numbers, this chapter builds out the structure each will occupy and
marks the missing content explicitly with **[DATA REQUIRED]**, consolidated into a single
checklist in §4.14. Sections 4.2–4.8 report on work that has actually been completed and verified.

### 4.2 System Implementation

#### 4.2.1 Development Environment

The prototype is implemented as a native (non-containerised) Node.js application, a deliberate
departure from an earlier Docker-based setup (removed in favour of three Docker-free local
Postgres routes documented in `docs/local-setup.md`: a hosted Neon serverless instance, a
zero-install embedded PGlite database via `npm run db:local`, or a locally installed Postgres
server). The stack, read directly from `package.json`, is:

**Table 4.1: Development stack**

| Layer                 | Technology                             | Version   | Role                                                                 |
| --------------------- | -------------------------------------- | --------- | -------------------------------------------------------------------- |
| Runtime               | Node.js                                | ≥ 20      | Server and build runtime (`package.json` `engines`)                  |
| Language              | TypeScript                             | 5.7       | Used throughout `app/`, `server/`, `scripts/`, `tests/`              |
| Web framework         | Nuxt                                   | 4.5       | Client (`app/`) and server route layer (Nitro, `server/api/`)        |
| UI framework          | Vue                                    | 3.5       | Component layer                                                      |
| Styling               | Tailwind CSS                           | 4.3       | Utility-first styling for the mobile-first UI                        |
| Input validation      | zod                                    | 3.24      | Schema validation on every server route (rule R8)                    |
| ORM / database access | Prisma                                 | 6.3       | Schema, migrations, and query layer over PostgreSQL                  |
| Unit/integration test | Vitest                                 | 3.0       | `server/domain`, `server/utils`, `tests/integration`                 |
| End-to-end test       | Playwright                             | 1.49      | Browser-driven scenarios at a 360px mobile viewport                  |
| Classifier service    | Python, FastAPI, PyTorch, Transformers | see below | Standalone out-of-process NLP service (`services/classifier/`)       |
| LLM integration       | Raw HTTPS calls (`fetch`)              | n/a       | Direct calls to the Anthropic Messages API; no vendor SDK dependency |

The classifier service (`services/classifier/`) pins `torch>=2.4,<3.0`, `transformers>=4.44,<5.0`,
`fastapi>=0.115,<1.0`, and `pydantic>=2.9,<3.0` in `services/classifier/requirements.txt`, ahead of
the trained-model swap described in §4.2.5 and §4.9, so that the service's dependency footprint
does not change when a trained model lands. The conversational layer's real LLM client
(`server/services/conversation/anthropic-client.ts`) calls
`https://api.anthropic.com/v1/messages` directly with the fetch API rather than depending on the
`@anthropic-ai/sdk` package, which is not a project dependency; a mock client
(`mock-client.ts`) is used by default and throughout the automated test suites (§4.5, §4.7.1).

Version control uses git with Conventional Commits, enforced by `commitlint.config.mjs` at commit
time. No container runtime (Docker/Compose) is required to run any part of the system as of this
commit; `docs/local-setup.md` documents the plain `npm install` / `npm run setup` / `npm run
dev:all` path used throughout this chapter's evaluation.

#### 4.2.2 System Architecture Implementation

The realised system follows the layered architecture set out in `docs/architecture.md`: a Nuxt 4
client (`app/`) calling zod-validated Nitro API routes (`server/api/`), which in turn call into a
dependency-free domain layer (`server/domain/`) for scoring, triage, and safety logic, and into a
services layer (`server/services/`) for the only network I/O the application performs. Three
units are separately deployable without a container runtime: the Nuxt app itself; the Python
classifier service, which the app runs correctly without (rule R7, verified in §4.2.5); and
PostgreSQL, accessed exclusively through Prisma. Security and privacy-by-design — encryption,
input validation, and log redaction — are implemented as cross-cutting concerns rather than
localised to one layer, consistent with `docs/architecture.md`'s layered diagram.

This section describes what was implemented for each of the five components named in Chapter
Three, naming the files that carry the corresponding `// [FR#]` / `// [NFR#]` requirement tags,
and records the deviations from the original design that surfaced during implementation. Because
the final submitted text of Chapter Three was not available to cross-check line by line during
this generation, the deviations below are drawn from the project's own architecture decision
records and from direct inspection of the implementation; a final reconciliation pass against the
submitted Chapter Three text is recommended before submission.

**Figure 4.1: Implemented System Architecture (layered view)**

[INSERT A RENDERED VERSION OF THE LAYERED ARCHITECTURE DIAGRAM FROM `docs/architecture.md` HERE,
ANNOTATED WITH THE THREE DEPLOYABLE UNITS DESCRIBED ABOVE]

##### 4.2.2.1 Screening engine (component 1)

The screening engine administers the PHQ-9 and GAD-7 instruments and scores them. The instrument
item sets and scoring rules live in `server/domain/instruments/phq9.ts`,
`server/domain/instruments/gad7.ts`, and `server/domain/scoring.ts`; the client-facing flow is
`app/composables/useScreeningSession.ts` and `app/pages/screen/[sessionId].vue`, backed by
`server/api/screening/start.post.ts`, `server/api/screening/[id]/answer.post.ts`, and
`server/api/instruments/[code].get.ts`. `scorePhq9` and `scoreGad7`
(`server/domain/scoring.ts`) are pure functions: given a complete set of item responses they
return a total and a band, and they reject an incomplete or out-of-range submission
(`IncompleteResponseError`, `InvalidResponseValueError`) rather than silently scoring a partial
answer set. No deviation from the validated instruments was found in the implementing files: both
instruments are administered with their full, unmodified item sets.

##### 4.2.2.2 Triage and safety-routing engine (component 2)

Risk banding and the crisis override are implemented as deterministic rule code in
`server/domain/triage.ts` and `server/domain/safety.ts`, with no model or network dependency of
any kind — `triage.ts` has deliberately zero imports, a structural choice recorded in its own
header comment as making rule R1 ("no model output may decide, lower, or override a risk level")
impossible to violate by accident rather than merely policy. `computeTriage` checks PHQ-9 item 9
first, ahead of every other rule and before any classifier suggestion is even read (rule R2);
only once that check passes does it compute a rule-based level from the PHQ-9/GAD-7 score
thresholds and optionally allow a classifier suggestion to raise — never set or lower — that
level by exactly one step. This design is documented and justified in
[`docs/decisions/0001-rule-based-triage.md`](decisions/0001-rule-based-triage.md), which records
that an end-to-end learned model was considered and rejected specifically because rule R2's "item
9 above zero always means CRISIS" guarantee cannot be proven of trained weights the way it can of
a one-line conditional. This is the one component where the ADR itself documents a deviation
already resolved at the design stage rather than one discovered during implementation: a jointly
learned rules+classifier scoring function was considered and rejected before any code was
written, for the reason above.

##### 4.2.2.3 NLP classifier integration (component 3)

The classifier is integrated as an out-of-process HTTP service with a defined contract
(`server/domain/model-contract.ts`), documented in `services/classifier/README.md`. Two
`ClassifierClient` implementations exist behind a single `classify()` entry point
(`server/services/classifier/index.ts`), selected by the `CLASSIFIER_MODE` runtime flag:
`http-classifier.ts` (a real HTTP call with a 3-second timeout, one retry, and a circuit breaker
that opens after five consecutive failures — `server/services/classifier/circuit-breaker.ts`) and
`mock-classifier.ts`, the default. `classify()` never throws: any failure resolves to
`{ status: 'unavailable', reason }` rather than rejecting, which is what makes rule R7 ("screening
must complete when the classifier is unreachable") enforceable at the type level rather than by
convention.

**Deviation, named plainly rather than glossed over.** Neither the TypeScript-side default
(`mock-classifier.ts`) nor the standalone Python service this integration talks to
(`services/classifier/app/main.py`) is a trained model. Both are deterministic heuristics — a
hash of the input text combined with a short, illustrative keyword lexicon — built specifically to
make the integration runnable and testable end to end before a real fine-tuned transformer exists.
Each carries its own explicit, non-clinical version identifier (`mock-0.1` in
`server/domain/model-contract.ts`'s `MOCK_MODEL_VERSION`; `scaffold-placeholder-0.1` in
`services/classifier/app/main.py`'s `MODEL_VERSION`) precisely so that a response from either can
never be mistaken for a trained model's output in a log, a database row, or an evaluation export.
Training code is explicitly out of scope for this repository and lives in a separate research
codebase (§4.9). This is the single largest deviation from a Chapter Three design that presumably
assumed a trained classifier would be integrated by MVP1; the HTTP contract, timeout/retry/circuit
breaker behaviour, and the one-step-only influence on triage (rule R1) are all built and tested
against that contract regardless of which implementation sits behind it, so integrating a trained
model when one is available is a matter of pointing `CLASSIFIER_SERVICE_URL` at it, not of
re-architecting the integration.

##### 4.2.2.4 Bounded conversational layer (component 4)

The conversational layer is a server-mediated chat surface for psychoeducation and score
explanation, reachable from `app/pages/support/[sessionId].vue` via
`server/api/conversation/[sessionId]/message.post.ts`. Its safety guarantees are enforced by a
deterministic pre-filter and post-filter (`server/domain/conversation-safety.ts`, 274 lines),
invoked from `handleConversationTurn()` in `server/services/conversation/orchestrate.ts` — the
pre-filter runs before an LLM client is even referenced, and the post-filter runs on the model's
response before it is ever returned to the caller. Both are plain lexicon/regex matches with no
model call of their own, which is what makes them provable by a fixed adversarial test suite
rather than merely asserted by the system prompt; this suite and its results are reported in full
in §4.6. `server/services/conversation/system-prompt.ts` defines the LLM's instructions; a mock
LLM client (`mock-client.ts`) and a real provider client (`anthropic-client.ts`) sit behind a
common interface, and per rule R7 any failure of the latter — timeout, connection error, non-2xx,
malformed response — degrades to a static fallback message rather than failing the request.

**Deviation.** `app/components/conversation/README.md` documents an intended split into
presentational components ("chat bubbles, disclaimers, suggested prompts") separate from the page
that hosts them, matching the pattern used elsewhere in `app/components/`. In the implementation
as it stands, that directory contains only the README; the entire conversational UI — bubbles,
disclaimers, suggested prompts, and the safety-exit affordance — is implemented directly in
`app/pages/support/[sessionId].vue` (279 lines). Functionally the page passes its own end-to-end
tests (`tests/e2e/conversation.spec.ts`, §4.5), so this is a structural deviation from the
intended component decomposition, not a functional gap.

##### 4.2.2.5 Clinician review interface (component 5)

The clinician realm is implemented as a structurally separate authentication and session system
end to end — `Clinician`/`ClinicianSession` tables, the `mira_clinician_session` cookie, and
`server/utils/clinician-auth.ts`'s `requireClinician`/`requireAdmin` guards, never sharing a
table, cookie, or middleware with the person-being-screened realm
(`server/middleware/clinician-auth.ts` versus `server/middleware/auth.ts`). The escalation queue
and detail view (`app/pages/clinician/index.vue`, 137 lines;
`app/pages/clinician/escalations/[id].vue`, 219 lines) are backed by
`server/api/clinician/escalations/index.get.ts` and `[id].get.ts`/`.patch.ts`; resource management
(`app/pages/clinician/resources/index.vue`, 336 lines) is `ADMIN`-gated separately from ordinary
clinician access via `requireAdmin`. A clinician view never includes a user id or email — only a
pseudonym, scores, risk level, and rationale — and free-text visibility is re-checked against live
`HUMAN_REVIEW` consent on every read, not just at the point an escalation was created
(`canRevealFreeTextToClinician`, `server/domain/consent.ts`).

**Deviation.** Escalations are delivered to the clinician realm via
`server/services/notification/console-notification-service.ts`, which writes an application log
entry rather than paging, emailing, or SMS-alerting a human reviewer. This is a deliberate MVP1
scope decision, not an oversight: the `NotificationService` interface
(`server/services/notification/notification-service.ts`) is implemented against, so a real paging
adapter can be substituted without changing any calling code, but no such adapter has been built.
Discussed further as a limitation in §4.12.

### 4.3 System Interfaces

Chapter Three's evaluation plan calls for one subsection per captured interface figure. At the
time of writing, `docs/screenshots/` contains only its own `README.md` (which documents the
intended use of the directory — capturing evaluation evidence, with the standing rule that no
image may contain real participant data per rule R10) and no image files. `scripts/capture-evidence.ts`
exists and is designed to produce exactly these captures at a 360×740 mobile viewport once `npm
run demo` has seeded the deterministic demo data it depends on (a seeded clinician queue and
escalations); it has not yet been run to completion. The figure placeholders below reserve the
numbering and captions this section will use once that capture is run, drawn directly from the
screenshot index in `docs/chapter-four-inputs.md`.

**Figure 4.2: Landing screen and disclaimer**
[INSERT SCREENSHOT: `docs/screenshots/landing.png` — `/`, the disclaimer and "Start a private
check" entry point]

**Figure 4.3: Consent framing**
[INSERT SCREENSHOT: `docs/screenshots/consent.png` — `/`; MVP1 has no separate consent step, the
landing disclaimer is what is agreed to (see §4.12 Limitations)]

**Figure 4.4: PHQ-9/GAD-7 screening item**
[INSERT SCREENSHOT: `docs/screenshots/question.png` — `/screen/[id]`, a single item mid-flow]

**Figure 4.5: Screening result screen**
[INSERT SCREENSHOT: `docs/screenshots/result.png` — `/result/[id]`, scores, risk band, and
rationale]

**Figure 4.6: Free-text explanation panel**
[INSERT SCREENSHOT: `docs/screenshots/explanation.png` — `/result/[id]`, "What your written
answer showed"]

**Figure 4.7: Static crisis pathway**
[INSERT SCREENSHOT: `docs/screenshots/crisis.png` — `/support/crisis`, clinician-reviewed,
non-generated copy]

**Figure 4.8: Bounded conversational layer**
[INSERT SCREENSHOT: `docs/screenshots/chat.png` — `/support/[id]`, one exchange]

**Figure 4.9: Psychoeducational resource library**
[INSERT SCREENSHOT: `docs/screenshots/resources.png` — `/resources`]

**Figure 4.10: Clinician escalation queue**
[INSERT SCREENSHOT: `docs/screenshots/clinician-queue.png` — `/clinician`, logged in as the
seeded admin]

**Figure 4.11: Clinician escalation detail view**
[INSERT SCREENSHOT: `docs/screenshots/clinician-detail.png` — `/clinician/escalations/[id]`, one
seeded HIGH escalation]

**Figure 4.12: Privacy dashboard**
[INSERT SCREENSHOT: `docs/screenshots/privacy-dashboard.png` — `/privacy/my-data`, the seeded
multi-session history user's data]

**Figure 4.13: Admin metrics dashboard**
[INSERT SCREENSHOT: `docs/screenshots/metrics.png` — `/admin/metrics`, latency and
triage-distribution charts]

> **[DATA REQUIRED]** Run `npm run demo` followed by `npm run capture-evidence` (or the direct
> `scripts/capture-evidence.ts` invocation documented in `scripts/README.md`) to produce the
> twelve images above, save them to `docs/screenshots/`, and replace each placeholder with the
> actual image and a one-sentence caption confirmed against what is on screen. Until that exists,
> this section cannot honestly be expanded beyond identifying which screens exist, which §4.2.2
> above already does by naming each page file.

### 4.4 Requirements Verification

**Table 4.2** below is reproduced from `docs/traceability-matrix.md`, generated by
`scripts/generate-traceability.ts` at 2026-08-30T15:13:24.970Z against a full run of the unit,
integration, and end-to-end test suites — the script re-runs all three tiers itself and
cross-references pass/fail against every `// [FR#]` / `// [NFR#]` tag in the codebase, so a status
of PASS below reflects a real test result at generation time, not an assumption. It is quoted
here, not hand-typed, per the instruction on that file's own first line never to hand-edit it.

**Table 4.2: Requirements verification status**

| Requirement | Description                                                                     | Status     |
| ----------- | ------------------------------------------------------------------------------- | ---------- |
| FR1         | Secure registration and authentication, including a first-class anonymous path. | ✅ PASS    |
| FR2         | Administer PHQ-9 and GAD-7.                                                     | ✅ PASS    |
| FR3         | Analyse free-text input with NLP to support screening.                          | ✅ PASS    |
| FR4         | Compute a risk level and produce a triage decision.                             | ✅ PASS    |
| FR5         | Serve psychoeducational resources.                                              | ✅ PASS    |
| FR6         | Escalate cases above a risk threshold to human support.                         | ✅ PASS    |
| FR7         | Clinician/admin review of flagged cases and resource management.                | ✅ PASS    |
| NFR1        | Privacy and security aligned to the Nigeria Data Protection Act 2023.           | ✅ PASS    |
| NFR2        | Usable on low-cost smartphones.                                                 | ✅ PASS    |
| NFR3        | Screening results returned within a defined, measured latency.                  | ✅ PASS    |
| NFR4        | Reliable and available under expected load.                                     | ✅ PASS    |
| NFR5        | Screening outputs accompanied by interpretable rationale.                       | ✅ PASS    |
| NFR6        | Architecture supports growth without redesign.                                  | ⚠️ NO TEST |

The full matrix, listing every implementing file and test file per requirement, is at
[`docs/traceability-matrix.md`](traceability-matrix.md) and is not reproduced in full here for
length; §4.2 above names the principal implementing files per component.

Twelve of the thirteen requirements verify as Met. NFR6 ("architecture supports growth without
redesign") is the one honest exception, and the traceability matrix itself explains why rather
than silently omitting it: no file in the codebase carries an `// [NFR6]` tag, because NFR6
describes an architectural and process property — layering, dependency direction, the
five-component authority order — rather than a single enforced code path a comment tag could
point at. This is not evidence the property is unmet; §4.2's description of the domain layer's
zero-dependency design and the services-layer isolation is the qualitative argument for it, and
`docs/architecture.md`'s layered diagram is the design artefact. It is evidence that MVP1, as
built, has no automated test that could fail if the architecture were violated — a future PR that
imports Prisma into `server/domain/`, for example, would not be caught by any CI gate today,
only by code review. Every other requirement, including the two (FR3, component 3) most affected
by the classifier being a placeholder rather than a trained model, verifies as fully met: FR3 as
specified is "analyse free-text input with NLP to support screening," and the placeholder
classifier does analyse free text and does supply a supplementary signal to triage under the same
contract a trained model will — the requirement is about the integration behaving correctly, which
it does, not about classification accuracy, which §4.9 addresses separately and honestly marks as
not yet available.

### 4.5 Functional Testing

Test counts and pass rates below were captured by running the suites directly against commit
`3c979e6` (§4.2.1's diff confirms no test or application code changed between that commit and the
current HEAD), rather than read from a prior CI record, so they are independent of the
traceability matrix's own (slightly earlier, same-day) run.

#### 4.5.1 Unit tests and coverage

`npm run test:coverage` (`vitest run --coverage server app tests/unit`): **24 test files, 342
tests, 342 passed, 0 failed.** The coverage report (v8 provider) for the two directories the
project's own coverage gate (`coverage-thresholds.json`, enforced by
`scripts/check-coverage-thresholds.ts` at a 90% floor per file, not a directory-wide average) is
run against:

**Table 4.3: Unit test coverage by directory**

| Directory                                           | Statements | Branches | Functions | Lines |
| --------------------------------------------------- | ---------- | -------- | --------- | ----- |
| `server/domain/**` (12 files, incl. `instruments/`) | 100%       | 100%     | 100%      | 100%  |
| `server/utils/**` (6 files)                         | 100%       | 100%     | 100%      | 100%  |

Every file in both directories individually cleared the threshold, and the script's own
per-file check (rather than a directory average) means this 100% cannot be hiding one weak file
behind strong siblings — the mechanism `check-coverage-thresholds.ts` uses is specifically
designed to catch that case, and its own header comment records a concrete prior instance
(`rate-limit.ts` at 66.66% function coverage) that a directory-wide average had let through before
the per-file check was introduced.

**Triage and safety modules specifically.** `server/domain/triage.ts` and
`server/domain/safety.ts` reach 100% statement, branch, function, and line coverage, and exhaustive
coverage was required there specifically because these are the two files rule R1 and rule R2
depend on: `triage.ts` is the only code path that can produce a risk band, and `computeTriage` is
a pure function of a small, fully enumerable input space (two bounded score totals, one bounded
item-9 value, and an optional bounded model suggestion), which is exactly the property that makes
100% branch coverage achievable and meaningful rather than aspirational. `triage.test.ts` (49
tests) exercises this directly:

- **Item 9 override (rule R2):** tests confirm the override fires when item 9 is any value above
  zero, takes precedence over a score combination that would independently reach HIGH, is
  completely unaffected by what the classifier suggests, and — the corresponding negative case —
  does _not_ fire when item 9 is exactly zero.
- **PHQ-9/GAD-7 banding boundaries:** `server/domain/scoring.test.ts`'s `scorePhq9`/`scoreGad7`
  suites (39 tests total) assert the exact band for a total at both edges of every threshold —
  PHQ-9 at totals 4/5 (MINIMAL/MILD), 9/10 (MILD/MODERATE), 14/15 (MODERATE/MODERATELY_SEVERE),
  and 19/20 (MODERATELY_SEVERE/SEVERE); GAD-7 at 4/5, 9/10, and 14/15 (MINIMAL/MILD,
  MILD/MODERATE, MODERATE/SEVERE) — rather than a single interior value per band, which is what
  makes the coverage of `triage.ts`'s threshold conditionals exhaustive rather than merely high.
- **Model adjustment (rule R1):** tests confirm a classifier suggestion at or below the rule-based
  level changes nothing, a suggestion exactly one step above raises the level by exactly one step,
  and a suggestion three steps above still only raises the level by one step — the ladder-clamp
  behaviour that keeps the classifier from ever setting a level on its own.
- **Purity:** identical input produces identical output across repeated calls, and the input
  object is not mutated — verifying the "deliberately zero imports" design claim in the file's own
  header comment has an observable, tested consequence.

#### 4.5.2 Integration tests

`npm run test:integration` (`vitest run tests/integration --pool=threads
--poolOptions.threads.singleThread`, against a real Postgres development database, not a
mock): **11 test files, 149 tests, 149 passed, 0 failed**, completing in 152.1 seconds. This tier
covers behaviour that requires a real running server and database and cannot be exercised by a
pure-function unit test: the full screening happy path from start through history
(`screening.test.ts`, 48 tests), consent-gated escalation visibility and the clinician-realm
separation (`clinician.test.ts`, 17 tests), DSAR export/erasure returning zero rows across every
linked table on a direct database query (`privacy.test.ts`), retention deleting free text,
abandoned sessions, and audit logs on their respective windows while leaving recent rows intact
(`retention.test.ts`), and the security-header/CSRF/rate-limit behaviour of a real running server
(`error-handling.test.ts`, `auth.test.ts`).

#### 4.5.3 End-to-end tests

`npx playwright test` runs 75 browser-driven scenarios across three projects (`mobile-360`,
`desktop`, and a single `classifier-degraded` project), listed via `npx playwright test --list`
against the same commit. Three runs were made while producing the underlying draft, and the
discarded first two are reported alongside the third because together they isolate the cause of
the failures observed, rather than leaving an unexplained number in this chapter.

The first run overlapped, for several minutes, with a manual read-only database query executed
against the same remote database compute for §4.7's latency figures (47 failures / 28 passes) and
is discarded as confounded by that concurrent query. Before the second run, two `npm run preview`
server processes were found still listening from the first run — `playwright.config.ts`'s
`reuseExistingServer: !process.env.CI` reuses an already-running server rather than starting a
fresh one outside CI, which meant the second run inherited the first run's in-memory
`screeningSubmissionRateLimiter` state (a 100-request-per-5-minute, per-hashed-IP budget documented
in `docs/security-controls.md`) rather than starting with an empty budget; that run (0 passes in
its first 14 attempts before it was stopped) is likewise discarded, and the leftover server
processes were killed before the third run.

The third run set `CI=1` specifically to force `reuseExistingServer: false` (a genuinely fresh
server and an empty rate-limit budget) and ran with no concurrent database activity. **Result: 29
passed, 37 failed, 9 flaky (failed at least once but passed on Playwright's automatic retry),
out of 75, over 1.4 hours.** This run is the one reported as evidence for this chapter, and it
still shows a high failure rate despite eliminating both confounds identified in the first two
runs. The webServer log for this run captured one explicit, unambiguous cause directly: a
`PrismaClientKnownRequestError` on `POST /api/auth/anonymous-start` reading _"Can't reach database
server at `ep-old-shape-axppp6gy.c-4.us-east-2.aws.neon.tech:5432`. Please make sure your database
server is running..."_ — a real, transient failure to reach the project's remote development
database from this execution environment, not an application-level defect. Consistent with that
cause, every one of the 113 timeout events recorded across all failed and flaky attempts
(including retries) was the same assertion — `Expect "toHaveURL" with timeout 30000ms` — the
browser waiting on a navigation that follows a server round trip (account creation, starting a
screening, sending a conversation message), never a missing element, a wrong value, or any other
assertion type. That uniformity across 37 distinct scenarios spanning nearly every spec file
(auth, clinician, conversation, resources, screening, privacy, metrics) is evidence of a single
shared cause — database round-trip latency or connectivity from this specific execution
environment to the remote database compute exceeding Playwright's 30-second assertion timeout —
rather than 37 unrelated application bugs. This reproduces, at a larger scale, the same class of
issue `docs/frontend-metrics.md` already documents for this database (cold start measured directly
at ~2.6s, against which `playwright.config.ts`'s 15s default was originally tuned) and is reported
here as a genuine finding about the evaluation environment, discussed further in §4.11 and §4.12,
rather than smoothed over or re-run indefinitely in search of a clean pass. It is also consistent
with, though not fully explained by, the fact that the committed `docs/traceability-matrix.md`
(§4.4) records a full-suite pass at generation time: that run's environment and network conditions
were not captured by this chapter and cannot be reconstructed from the repository alone.

**Table 4.4: Test suite summary**

| Tier                      | Files | Tests | Passed | Failed | Flaky | Notes                                            |
| ------------------------- | ----- | ----- | ------ | ------ | ----- | ------------------------------------------------ |
| Unit (`vitest`)           | 24    | 342   | 342    | 0      | —     | 100% coverage of `server/domain`, `server/utils` |
| Integration (`vitest`)    | 11    | 149   | 149    | 0      | —     | Against a real running server + database         |
| End-to-end (`playwright`) | —     | 75    | 29     | 37     | 9     | Traced to remote-database connectivity, §4.5.3   |

### 4.6 Safety and Guardrail Evaluation

The adversarial test suite documented in `docs/llm-safety-tests.md` and implemented in
`server/domain/conversation-safety.test.ts` was re-run as part of the unit suite in §4.5.1 (it is
one of the 24 files, contributing 60 of the 342 unit tests) and passed in full: **60/60 tests
passed, 0 failed.** Those 60 tests break down as: 3 basic-behaviour checks for
`checkCrisisIndicators` (the pre-filter) and 2 for `checkOutputSafety` (the post-filter) — 5 tests
total; one meta-assertion that the adversarial case list contains at least the 25 cases required;
**40 adversarial cases**, each run as an individual parameterised test against the specific filter
and reason code it is expected to trigger; and a 14-case control group (8 legitimate user inputs
that must not trigger the pre-filter, 6 legitimate model outputs that must not trigger the
post-filter), included specifically so a filter that flagged everything indiscriminately could not
trivially "pass" the 40 adversarial cases.

The 40 adversarial cases are grouped into six categories, matching `docs/llm-safety-tests.md`'s
own breakdown:

**Table 4.5: Adversarial safety-test categories and results**

| Category                                                                                                                                              | Cases | Caught by   | Result       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------- | ------------ |
| A — crisis-eliciting user input (direct, softened, roleplay, third-person, minimization, harm-to-others, acute distress, embedded, fictional wrapper) | 10    | Pre-filter  | 10/10 caught |
| B — diagnosis simulated in model output                                                                                                               | 7     | Post-filter | 7/7 caught   |
| C — medication/dosage advice simulated in model output                                                                                                | 7     | Post-filter | 7/7 caught   |
| D — therapist/clinician persona claimed in model output                                                                                               | 7     | Post-filter | 7/7 caught   |
| E — crisis instructions issued by the model itself                                                                                                    | 4     | Post-filter | 4/4 caught   |
| F — verbatim system-prompt disclosure                                                                                                                 | 5     | Post-filter | 5/5 caught   |

All 40 adversarial cases were caught by the mechanism intended to catch them (10 by the
pre-filter, before any LLM call is made; 30 by the post-filter, on the model's output); **zero
cases were not caught.** The 14-case control group correctly passed through untouched in every
case, confirming the filters are precise rather than indiscriminately over-triggering.

`docs/llm-safety-tests.md` also records that this suite is not a trivially-passing one written
after the fact: on the first execution, three of the (then) 40 assertions failed for genuine
lexicon gaps — a third-person self-harm phrasing (A5, "asking for a friend... they want to end
their life"), a severity-modified diagnostic claim (B1, "you have _moderate_ depression"), and a
second-person crisis instruction (E2) — each fixed by extending the relevant phrase list, with the
fix and the reason recorded in the document. A fourth apparent failure (F5) was traced to a
test-authoring error (a paraphrase rather than a verbatim quote of the system prompt) rather than
a filter gap, and the test case was corrected rather than the filter loosened.

`docs/llm-safety-tests.md` documents three limitations of this mechanism honestly rather than
silently: it cannot catch a paraphrased (non-verbatim) system-prompt disclosure, since the n-gram
check is a literal-overlap check, not a semantic one; it cannot catch a novel phrasing outside the
tested lexicons, since no phrase/pattern list is an exhaustive enumeration of every way to express
a crisis disclosure, diagnosis, or medication reference; and it operates on English text only,
matching the instruments themselves. None of these describe a phrasing within the 40 tested cases
slipping through — they describe the boundary of what deterministic pattern matching can do at
all, which is a property of the approach, not a defect found in testing.

### 4.7 Performance Evaluation

#### 4.7.1 Latency

Figures below were captured by querying the `metrics` table directly (the same `percentile_cont`
query `GET /api/admin/metrics`, `server/api/admin/metrics.get.ts`, runs) against the project's
development Postgres database on 2026-08-30. **These rows are exclusively metrics recorded by the
automated integration and end-to-end test suites executing against a remote development
database** — `293` rows in total — not observations from real screening sessions under field
conditions or a deployed instance; the metric names and what each one measures are defined in
`docs/evaluation-data-dictionary.md`.

**Table 4.6: Latency percentiles by metric (test-suite traffic, remote dev database)**

| Metric name                    | Count | p50 (ms) | p95 (ms) | p99 (ms) | Min (ms) | Max (ms) |
| ------------------------------ | ----- | -------- | -------- | -------- | -------- | -------- |
| `screening_complete_server_ms` | 138   | 2,080    | 4,884    | 8,262    | 1,143    | 15,884   |
| `screening_complete_e2e_ms`    | 86    | 5,664    | 11,696   | 15,261   | 3,472    | 16,090   |
| `classifier_call_server_ms`    | 20    | 1,860    | 5,473    | 8,395    | 1,190    | 9,125    |
| `classifier_call_e2e_ms`       | 14    | 0        | 1        | 1        | 0        | 1        |
| `llm_turn_server_ms`           | 21    | 2,115    | 3,703    | 4,041    | 1,807    | 4,125    |
| `llm_turn_e2e_ms`              | 14    | 0        | 0        | 0        | 0        | 0        |

The `_e2e_ms` figures for the classifier and LLM calls are near-zero because both are served, in
this test environment, by the deterministic mock implementations described in §4.2.2.3 and
§4.2.2.4 (`CLASSIFIER_MODE`/LLM client defaults to the mock/in-process client for the automated
suites), which have no real network round trip to measure; the corresponding `_server_ms` figures
(1.1–9.1 seconds) reflect real database round trips against the remote development instance from
within the handler, which `docs/frontend-metrics.md` separately measured directly at approximately
2.6 seconds cold and 275 milliseconds warm — consistent with the wide spread between this table's
minimum and maximum values, which straddle the database's compute-suspend/resume boundary.

> **[DATA REQUIRED]** These figures characterise test-suite traffic against a shared development
> database with variable cold-start latency, not NFR3 acceptance evidence under realistic field
> conditions (a warm, dedicated database connection and real device/network conditions
> representative of the target Android/low-bandwidth audience, per NFR2). A latency measurement
> run against a warm, non-shared database — ideally from `data/evaluation-export/latency.csv`
> produced by `scripts/export-evaluation-data.ts` once real or moderated-evaluation sessions exist
> — is needed before these numbers can be cited as NFR3 evidence in the Discussion section.

#### 4.7.2 Triage distribution

From the same query, across every completed screening ever recorded against this development
database (test-generated data, not representative of a real population's symptom distribution):

**Table 4.7: Triage risk-level distribution (test/development database)**

| Risk level | Count |
| ---------- | ----- |
| MINIMAL    | 172   |
| MILD       | 17    |
| MODERATE   | 5     |
| HIGH       | 84    |
| CRISIS     | 33    |

This distribution reflects the test suites' own fixture data (which deliberately constructs HIGH
and CRISIS cases to exercise the escalation and safety paths) rather than any claim about
real-world prevalence, and is reported here only because it is what the Metric/TriageResult tables
actually contain, per the instruction to read this section from real data rather than omit it
silently.

#### 4.7.3 Frontend performance

Reproduced from `docs/frontend-metrics.md`, itself measured against a production build
(`npm run build && node .output/server/index.mjs`), not the development server:

**Table 4.8: Frontend performance and accessibility metrics**

| Metric                            | Value      |
| --------------------------------- | ---------- |
| Initial JS payload (gzipped)      | ~77.4 KB   |
| Initial CSS payload (gzipped)     | ~3.6 KB    |
| **Total initial payload**         | **~81 KB** |
| Lighthouse Performance (mobile)   | 82 / 100   |
| Lighthouse Accessibility (mobile) | 100 / 100  |
| First Contentful Paint            | 2.3 s      |
| Largest Contentful Paint          | 2.3 s      |
| Total Blocking Time               | 540 ms     |
| Cumulative Layout Shift           | 0          |
| Time to Interactive               | 3.0 s      |

The Lighthouse run used `throttling-method=simulate` against Lighthouse's default mobile profile
(approximately slow 4G, 4x CPU slowdown), chosen deliberately as the closer match to NFR2's target
device class (cheap Android hardware, expensive/unreliable data) than an unthrottled run would be.
The 81KB payload is well under the NFR2 budget of 200KB; the FCP/LCP/TTI figures are dominated by
the throttling profile's simulated network round trip and CPU slowdown rather than by payload size
itself. Full Lighthouse reports are preserved at `docs/lighthouse/landing.report.html` and
`.json`. `docs/frontend-metrics.md` additionally reports every foreground/background text colour
pairing in the screening UI against the WCAG 4.5:1 contrast minimum (nine pairs checked, all
passing with margin, computed directly from the Tailwind colour values in use via the relative-
luminance formula).

### 4.8 Privacy and Security Evaluation

**Against Objective 5 (privacy-preserving design aligned to the NDPA 2023),**
`docs/ndpa-mapping.md` maps every principle in NDPA 2023 s.24 (lawfulness/fairness/transparency,
purpose limitation, data minimisation, accuracy, storage limitation, integrity/confidentiality,
accountability) and every Part VI data-subject right to a specific control, implementing file, and
test, rather than asserting compliance in prose. Concretely: purpose limitation is enforced
through three separately-consentable purposes (`SCREENING`, `RESEARCH_LOGGING`, `HUMAN_REVIEW`,
`server/domain/consent.ts`); data minimisation through pseudonym display and keyed-hash email
storage (`server/utils/privacy.ts`); storage limitation through a scheduled retention task
deleting free text after 90 days, abandoned sessions after 30 days, and audit logs after 12 months
(`server/utils/retention.ts`, verified in `tests/integration/retention.test.ts`, §4.5.2); and
integrity/confidentiality through AES-256-GCM field encryption and log redaction
(`server/utils/crypto.ts`, `server/utils/privacy.ts`). Right to access/portability and right to
erasure are both implemented as real, tested mechanisms — a decrypted JSON export
(`server/utils/dsar.ts`'s `exportUserData`) and a cascading hard delete verified by a direct
database query returning zero rows across every linked table
(`tests/integration/privacy.test.ts`) — not aspirational policy text.

Two rights are honestly reported as not implemented rather than silently claimed: **right to
restriction of processing** (Mira offers full erasure or per-purpose consent withdrawal, not an
intermediate "retain but stop processing" state) and **right to rectification** (there is no route
to correct a stored answer or score; the documented workaround is deleting and re-screening the
affected session). `docs/ndpa-mapping.md` also records two smaller, genuine tensions rather than
upgrading them to fully resolved: `SCREENING` consent is recorded and can be withdrawn in the
dashboard but is not currently checked by any server code before screening proceeds — a deliberate
consequence of rule R9 (screening is never gated on consent), stated in the dashboard's own copy
rather than implied away; and `AuditLog` rows referencing a deleted account are not themselves
erased, since the append-only integrity of the accountability trail was judged to outweigh
removing an orphaned, PHI-free actor identifier. No named data controller or verified contact
address exists in the repository, consistent with this being a research prototype rather than a
deployed service (rule R10), and breach notification is recorded as an organisational process gap
with no corresponding code, appropriate for a system holding no real participant data at this
stage.

`docs/security-controls.md`'s threat model names six concrete scenarios for this specific system
— shared/borrowed-device access, network observation, database compromise, a malicious or
compromised clinician account, prompt injection through free text, and account enumeration — and
for each names both the controls in place and the residual risk left open, rather than treating
the threat model as fully closed. The residual risks named there and worth repeating as findings
rather than settled ground: there is no PIN, biometric re-lock, or "quick exit" affordance for the
shared-device scenario (the existing `SafetyExitButton` reaches crisis help fast but is explicitly
documented as not solving a privacy quick-exit problem); a database compromise combined with a
compromise of the application's own secrets defeats the encryption-at-rest protection entirely,
since key separation only helps against a partial compromise; a valid but stolen or misused
clinician session can see everything a legitimate one can, with no anomaly detection, no per-case
assignment/ownership model, and no two-person approval for any action; and the LLM post-filter
(§4.6) is a deterministic pattern match, not a semantic understanding of model output, so a
sufficiently novel harmful phrasing outside the tested lexicons is a documented, not a closed,
risk. The dependency audit (`npm audit`, 2026-08-27, reproduced in `docs/security-controls.md`)
found five advisories, all in transitive development-only dependencies of the Prisma CLI and an
ESLint dev-tooling plugin, none reachable from the deployed server process — confirmed by tracing
each to its actual dependency path rather than accepted on severity label alone.

### 4.9 Classifier Results

> **[DATA REQUIRED]** This subsection reports results from a fine-tuned transformer classifier
> trained on the DAIC-WOZ dataset (§3.7) in a separate Python training run, external to this
> repository. That training has not yet been completed at the time of writing. **No number
> reported anywhere in this chapter derives from a trained classifier.** Every classifier-related
> figure elsewhere in this document (§4.2.2.3, §4.7.1's `classifier_call_*` rows) originates from
> one of two non-clinical placeholders, each carrying an explicit version string that distinguishes
> it from a real model's output: `server/services/classifier/mock-classifier.ts`, tagged
> `MOCK_MODEL_VERSION = "mock-0.1"`, and the standalone FastAPI scaffold at
> `services/classifier/app/main.py`, tagged `MODEL_VERSION = "scaffold-placeholder-0.1"`. Both
> implement the same deterministic heuristic — a hash of the input text plus a small illustrative
> keyword lexicon — and neither should be read as evidence of classification accuracy in any
> direction.
>
> The scaffold below reserves the structure this subsection will occupy once training completes.

#### 4.9.1 Training and evaluation setup

Dataset (DAIC-WOZ), split methodology, model architecture, and hyperparameters.
**[DATA REQUIRED — from the training repository.]**

#### 4.9.2 Classification performance

**Table 4.9: Classifier performance (pending)**

| Metric                  | Value                |
| ----------------------- | -------------------- |
| Accuracy                | [PENDING EXPERIMENT] |
| Precision (SYMPTOMATIC) | [PENDING EXPERIMENT] |
| Recall (SYMPTOMATIC)    | [PENDING EXPERIMENT] |
| F1 score                | [PENDING EXPERIMENT] |

#### 4.9.3 Confusion matrix

**Table 4.10: Classifier confusion matrix (pending)**

|                        | Predicted SYMPTOMATIC | Predicted NON_SYMPTOMATIC |
| ---------------------- | --------------------- | ------------------------- |
| Actual SYMPTOMATIC     | [PENDING EXPERIMENT]  | [PENDING EXPERIMENT]      |
| Actual NON_SYMPTOMATIC | [PENDING EXPERIMENT]  | [PENDING EXPERIMENT]      |

#### 4.9.4 Comparison against baseline

The trained model's metrics against a stated baseline — e.g. the majority-class classifier, or the
deterministic heuristic in `mock-classifier.ts`/`main.py` itself, which, since it is fully
specified in this repository, is a legitimate, reproducible baseline to compare against.
**[PENDING EXPERIMENT]**

### 4.10 Usability Evaluation

> **[DATA REQUIRED]** This subsection reports results from Instrument B, the post-use evaluation
> questionnaire administered to participants after a moderated screening session (§3.8.1). No such
> session has been run at the time of writing. The infrastructure this evaluation depends on does
> exist and is described so the scaffold below is not speculative: `EVALUATION_MODE` (checked by
> `isEvaluationModeEnabled()`, `config/runtime.ts`) gates a researcher-facing start/stop control
> (`app/pages/admin/evaluation.vue`) that records a consented `EvaluationSession` keyed to a
> researcher-assigned `participantCode`, and `app/middleware/evaluation-tracking.global.ts` logs
> `SCREEN_TRANSITION`, `BACK_NAVIGATION`, and `ERROR_ENCOUNTERED` events automatically during that
> session — never free text or anything a participant typed, per
> `docs/evaluation-data-dictionary.md`. `scripts/export-evaluation-data.ts` is the designated
> source for the behavioural measures below; it writes `tasks.csv` (task-level start/end/
> completion) among its four de-identified exports.

#### 4.10.1 Participant demographics

**Table 4.11: Participant demographics (pending)**

| Characteristic       | n   | %   |
| -------------------- | --- | --- |
| [PENDING EXPERIMENT] |     |     |

#### 4.10.2 System Usability Scale (SUS)

Scoring procedure: the standard 10-item, 5-point Likert SUS instrument, scored per Brooke
(1996) — odd items scored (response − 1), even items scored (5 − response), summed and
multiplied by 2.5 for a 0–100 scale per participant. **[REFERENCE REQUIRED — Brooke (1996) full
citation; cited in Chapter Three §3.8.1 and §3.8.3 but not present in the Chapter Two reference
list supplied for this generation.]**

**Table 4.12: SUS scores per participant (pending)**

| Participant          | SUS score |
| -------------------- | --------- |
| [PENDING EXPERIMENT] |           |

Mean SUS score: **[PENDING EXPERIMENT]**. Interpretation against published SUS benchmarks:
**[REFERENCE REQUIRED]**.

#### 4.10.3 Task completion rate and time on task

Derived from `tasks.csv` (`scripts/export-evaluation-data.ts`): completion rate is the fraction
of task rows with `completed = true`; time on task is `duration_ms` per row, with the median
reported per `docs/evaluation-data-dictionary.md`'s stated definition.

**Table 4.13: Task completion rate and time on task (pending)**

| Task                 | Completion rate | Median time (s) |
| -------------------- | --------------- | --------------- |
| [PENDING EXPERIMENT] |                 |                 |

#### 4.10.4 Qualitative response categories

Thematic categories from open-ended questionnaire responses. **[PENDING EXPERIMENT]**

### 4.11 Discussion

The implementation reported in this chapter demonstrates that the four MVP1-complete components —
the screening engine, the rule-based triage and safety-routing engine, the classifier integration
(under its placeholder implementation), and the clinician review interface, together with the
bounded conversational layer's safety guardrails — meet their specified requirements under
automated verification, with one architectural property (NFR6) verified only qualitatively rather
than by an automated test, and two smaller structural deviations from the intended component
decomposition (§4.2.2.4's conversational UI, §4.2.2.5's console-only notification adapter) that do
not affect functional correctness. The zero-import design of `server/domain/triage.ts` and the
100% branch coverage achieved over its enumerable input space (§4.5.1) directly support the thesis
argument, made in the ADR underlying this design (§4.2.2.2), that a hard safety guarantee like
rule R2 needs to be provable from source rather than merely likely from training data — this is
the strongest evidence this chapter can offer toward the research objective of a safety-first
triage architecture, precisely because it is a property that can be read out of a fully-covered,
dependency-free file rather than inferred statistically.

The adversarial safety evaluation (§4.6) demonstrates that the bounded conversational layer's
guardrails are not merely a system-prompt instruction but an independently testable mechanism:
100% of the 40 adversarial cases across six attack categories were caught, and the three genuine
gaps the first execution of that suite surfaced (§4.6) — each a real lexicon omission, found and
closed before this draft, not a hypothetical one — are themselves evidence that the suite
exercises the mechanism rather than confirming an assumption. The honestly-documented boundary of
what deterministic pattern matching cannot catch (paraphrased disclosure, novel phrasing,
non-English input) is a property of the chosen architecture, consistent with the ADR's broader
argument (§4.2.2.2) that this system prefers provable, narrow guarantees over probabilistic, broad
ones.

Two results this chapter reports are explicitly not strong enough to support a claim about
real-world performance and should not be read as such. The latency figures in §4.7.1 characterise
automated test traffic against a shared development database with documented cold-start
variability, not field conditions; NFR3's status of "Met" in §4.4 reflects the presence of a
measured, queryable latency instrumentation pipeline (the requirement's literal text) rather than
a claim that observed latencies meet any specific target under realistic use, and this chapter
does not make that stronger claim. Similarly, the triage-band distribution in §4.7.2 is an
artefact of test fixture design, not a finding about symptom prevalence, and is reported only
because the instruction governing this chapter requires reading exactly what the data source
contains rather than omitting an unflattering or uninformative result.

This chapter does not discuss classifier accuracy (§4.9) or usability findings (§4.10), since
both remain marked [DATA REQUIRED]/[PENDING EXPERIMENT]; any interpretation of those results
belongs in a revision of this section once the underlying data exists, not as anticipation here.

The end-to-end results (§4.5.3) are the one place this chapter reports a finding it did not set
out to measure: a 37/75 failure rate (plus 9 flaky) on an isolated, confound-free run, traced to
real, intermittent connectivity between the evaluation environment and the project's remote
development database rather than to any application defect — every failure was the same assertion
type, on a navigation following a server round trip, never a functional mismatch. This should be
read as a finding about the evaluation environment's suitability for browser-driven testing
against a remote serverless database with a fixed 30-second assertion budget, not as evidence
against the screening flow's correctness, which the same code paths' integration-tier tests
(§4.5.2, 149/149 passing, also against the same remote database but without a browser or a fixed
per-assertion timeout in the loop) and the previously-generated traceability matrix (§4.4) both
support. It does, however, temper how strongly this chapter can claim NFR4 ("reliable and
available under expected load") is demonstrated in practice: the traceability matrix's automated
PASS for NFR4 reflects a different run under different, uncaptured conditions, and this chapter's
own reproducible measurement of the same suite tells a less reliable story.

### 4.12 Limitations

- **The NLP classifier is untrained.** Both the TypeScript-side default
  (`mock-classifier.ts`, `mock-0.1`) and the standalone Python service
  (`services/classifier/app/main.py`, `scaffold-placeholder-0.1`) are deterministic heuristics —
  a hash of the input text plus a small illustrative keyword lexicon — not a fine-tuned
  transformer. No classification-accuracy claim can be made for MVP1 (§4.9).
- **The notification service is a console/log adapter, not a real paging mechanism.**
  `server/services/notification/console-notification-service.ts` writes an application log entry
  on escalation; no SMS, email, or paging integration exists, so in a real deployment a clinician
  would not be actively notified of a new escalation without checking the queue.
- **Single-language interface.** Both instruments and the conversational layer's safety lexicons
  are English-only (`docs/llm-safety-tests.md`), which does not match the full linguistic range of
  the Nigerian context this system targets.
- **Helpline contact information is unverified placeholder data.** Every entry in
  `config/helplines.ts` is marked `TODO_VERIFY` (`ALL_HELPLINES_VERIFIED` currently evaluates to
  `false`); a startup warning is emitted while this remains true, confirmed directly in the
  Playwright web-server logs captured during this chapter's own test runs ("`config/helplines.ts`
  still has unverified TODO_VERIFY placeholder contacts"). No real, dialable crisis contact
  currently ships with this codebase, per rule R10. The same run also logged that 12 active
  psychoeducational resources still carry an unverified `TODO_VERIFY` source attribution
  (`content/resources/`), a comparable gap for citation integrity rather than crisis safety.
- **No offline-first synchronisation.** `docs/frontend-metrics.md` documents optimistic,
  locally-buffered answering during a screening session, which tolerates a dropped connection
  mid-session, but this is not the same as a full offline-first architecture with background sync
  across a session boundary.
- **No clinical validation of the triage thresholds against clinician judgement.** The PHQ-9/GAD-7
  band boundaries and the risk-level mapping in `server/domain/triage.ts` follow the instruments'
  published scoring conventions, but no comparison of MVP1's routing decisions against independent
  clinician judgement on real or simulated cases has been conducted as part of this chapter.
- **Evaluation sample constraints.** Both the classifier's training/evaluation data (§4.9) and the
  usability evaluation's participant sample (§4.10) are external to this repository and had not
  been produced at the time of writing; the size and composition of either sample cannot yet be
  characterised.
- **NFR6 has no automated enforcement.** As discussed in §4.4, the architectural properties NFR6
  describes are not guarded by any test that would fail if violated — a future change that
  violates the domain layer's zero-dependency design, for instance, would not be caught by CI
  today.
- **The end-to-end suite is sensitive to remote-database connectivity in a way that produced a
  high, reproducible failure rate in this evaluation environment.** §4.5.3's isolated run recorded
  29/75 passing with 37 failures and 9 flaky results, traced to intermittent connectivity between
  this environment and the project's remote database compute rather than an application defect.
  This does not by itself indicate a defect in the screening flow (§4.5.2's integration tests
  against the same database, without a browser, passed 149/149), but it does mean this chapter's
  own reproduction of the end-to-end suite cannot be cited as strong evidence for NFR4 in the way
  the unit and integration results can, and a warm, dedicated database connection is needed before
  a clean end-to-end run can be treated as representative.
- **No containerised deployment exists.** By design (§4.2.1) — the current native local-setup
  path is deliberate and documented in `docs/local-setup.md`, but a production deployment would
  still need a packaging/deployment story beyond `npm run build && node .output/server/index.mjs`.

### 4.13 Chapter Summary

This chapter reported what was implemented and what was measured for Mira's MVP1 build. Twelve of
thirteen functional and non-functional requirements verified as fully met under a real,
automatically-regenerated traceability matrix, with the thirteenth (NFR6) honestly reported as
architecturally present but not automatically enforced. The screening, triage/safety-routing, and
clinician-review components, together with the conversational layer's safety guardrails, are
backed by 100% branch coverage on their safety-critical domain logic and a 40-case adversarial
suite with zero uncaught cases. Two components — the NLP classifier and the usability evaluation —
remain, honestly, incomplete: MVP1 integrates a non-clinical placeholder classifier and has not
yet run a moderated usability session, and this chapter has scaffolded rather than fabricated the
sections those results will eventually occupy. Performance and interface-capture evidence is
partial for documented, structural reasons (a shared development database and an empty
screenshots directory, respectively) rather than withheld, and the chapter's own reproduction of
the end-to-end suite surfaced a genuine, reproducible evaluation-environment finding — a high
failure rate traced to remote database connectivity rather than to the application — reported in
full rather than re-run until it disappeared. §4.14 consolidates every outstanding item this
chapter could not close.

### 4.14 Outstanding Experimental Evidence

The following evidence must be obtained before the final version of this chapter is submitted:

1. **Interface screenshots** (§4.3) — capture all twelve interface screens via `npm run demo`
   followed by `scripts/capture-evidence.ts`, save to `docs/screenshots/`, and index them in a new
   `FIGURES.md` with figure numbers and captions.
2. **A clean end-to-end test run against a warm, dedicated database** (§4.5.3, §4.11, §4.12) — to
   determine whether the 37/75 failure rate reported was specific to this environment's
   connectivity to the shared remote development database. Re-run `npx playwright test` (`CI=1`,
   no concurrent database activity) against a dedicated database instance or a network path with
   reliable access to the current one.
3. **Latency percentiles under realistic field conditions** (§4.7.1) — a warm, dedicated database
   and representative device/network conditions, not shared-dev-database test traffic. Source:
   `scripts/export-evaluation-data.ts`'s `latency.csv`, once real or moderated-evaluation sessions
   exist.
4. **Training and evaluation setup for the DAIC-WOZ-trained classifier** (§4.9.1) — from the
   separate Python training repository.
5. **Accuracy, precision, recall, and F1 for the trained classifier** (§4.9.2) — from the separate
   Python training repository.
6. **Confusion matrix for the trained classifier** (§4.9.3) — from the separate Python training
   repository.
7. **Comparison of the trained classifier against a stated baseline** (§4.9.4) — from the separate
   Python training repository, e.g. against the deterministic heuristic already implemented in
   `mock-classifier.ts`/`main.py`.
8. **Usability evaluation participant demographics** (§4.10.1) — from Instrument B / moderated
   evaluation sessions.
9. **SUS scores per participant and mean, plus the full citation for Brooke (1996)** (§4.10.2) —
   from Instrument B and `scripts/export-evaluation-data.ts`; the citation is currently marked
   [REFERENCE REQUIRED].
10. **Interpretation of SUS scores against published benchmarks** (§4.10.2) — [REFERENCE REQUIRED].
11. **Task completion rate and median time on task** (§4.10.3) — from
    `data/evaluation-export/tasks.csv` via `scripts/export-evaluation-data.ts`.
12. **Qualitative response categories from open-ended questionnaire items** (§4.10.4) — from
    Instrument B.

---

**Provenance note.** This file consolidates and reformats `docs/chapter-four-draft.md` (the
original, untracked-numbers-frozen draft) to match the section/table/figure numbering conventions
used elsewhere in this thesis and to add explicit figure placeholders and a consolidated
outstanding-evidence checklist. `docs/chapter-four-inputs.md` remains the authoritative index of
_where_ each category of evidence lives in the repository and _how_ to reproduce it; this file is
the chapter text itself. Regenerate both from the commands listed in the generation record above
whenever code under `server/`, `app/`, or `tests/` changes.
