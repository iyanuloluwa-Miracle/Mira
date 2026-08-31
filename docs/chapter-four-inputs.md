# Chapter Four inputs

A single index of where every category of Chapter Four evidence actually lives in this
repository, and how to reproduce each figure. This document cross-references the primary sources
below rather than duplicating them — duplicated numbers drift out of date; a pointer to the
generator doesn't.

## Requirements (FR/NFR) with evidence pointers

Authoritative source: [`docs/traceability-matrix.md`](traceability-matrix.md), generated (never
hand-edited) by `scripts/generate-traceability.ts` from `// [FR#]` / `// [NFR#]` tags plus test
metadata. Regenerate with `npm run traceability` before citing it — the file records its own
generation timestamp and the commit it was generated against.

As of its last recorded generation: FR1–FR7 and NFR1–NFR5 all show ✅ PASS with real implementing
files and real test files listed per requirement. NFR6 ("architecture supports growth without
redesign") is honestly marked ⚠️ NO TEST — it's an architectural property, not a single enforced
code path, so there is no file to tag; see the matrix's own "Honest gaps" section.

## Latency figures, test results, and coverage

Reproduce in this order against a real database (see [docs/local-setup.md](local-setup.md)):

1. `npm run test:coverage` (`vitest run --coverage server app tests/unit` +
   `tsx scripts/check-coverage-thresholds.ts`) — unit test counts and per-file coverage for
   `server/domain` and `server/utils`, checked against
   [`coverage-thresholds.json`](../coverage-thresholds.json) (90% statements/branches/functions/
   lines for both directories).
2. `npm run test:integration` (`vitest run tests/integration`, single-threaded — see that
   script's own comment on why) — integration test counts and pass/fail, run against a real
   spawned server (`.output/server/index.mjs`, so `npm run build` must run first).
3. `npx playwright test` — full end-to-end suite at the 360px mobile viewport
   (`playwright.config.ts`'s `mobile-360` project is the default).
4. Latency and triage-distribution figures come directly from the `Metric` and `TriageResult`
   tables — see [`docs/evaluation-data-dictionary.md`](evaluation-data-dictionary.md) for the
   exact metric names (`screening_complete_server_ms` etc.) and query shapes, and
   `server/api/admin/metrics.get.ts` for the live version of the same query the `/admin/metrics`
   page renders (captured in `docs/screenshots/metrics.png` — see below).
5. Frontend performance/accessibility figures (bundle size, Lighthouse, contrast): see
   [`docs/frontend-metrics.md`](frontend-metrics.md).

`docs/chapter-four-draft.md` (not tracked in this repository — a working thesis draft) records a
specific past run's numbers against a named commit; treat this document, not that snapshot, as
the pointer to _how_ to regenerate current figures.

## LLM safety test results

See [`docs/llm-safety-tests.md`](llm-safety-tests.md) in full. Summary: rule R6 is enforced by a
deterministic pre-filter and post-filter (`server/domain/conversation-safety.ts`), never by the
system prompt alone — the pre-filter runs before any LLM client is constructed and short-circuits
straight to the static crisis pathway on a match. Proven by the adversarial suite in
`server/domain/conversation-safety.test.ts`, the orchestration-level proof in
`server/services/conversation/orchestrate.test.ts` that the pre-filter path never calls an LLM
client, and an end-to-end pass in `tests/integration/conversation.test.ts`.

## NDPA 2023 mapping

See [`docs/ndpa-mapping.md`](ndpa-mapping.md) in full, including its own "Honest gaps" section
(e.g. `SCREENING`-purpose consent is recorded and shown but not yet gated on anywhere, by design
per rule R9; `AuditLog` rows are not erased on account deletion).

## Security threat model

See [`docs/security-controls.md`](security-controls.md) in full. Six scenarios are walked through
end to end: (1) another person picks up the user's phone, (2) network observation, (3) database
compromise, (4) a malicious or compromised clinician account, (5) prompt injection through free
text, (6) enumeration of accounts through the auth endpoints — plus headers/CSP, CSRF, input
validation (rule R8), rate limiting, session security, global error handling, dependency audit,
audit logging, and encryption at rest.

## Screenshot index

Produced by `scripts/capture-evidence.ts` (`npm run demo` first, so the seeded clinician queue and
escalations it depends on exist), written to `docs/screenshots/` at a 360×740 mobile viewport:

| File                    | Screen                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `landing.png`           | `/` — the disclaimer and "Start a private check" entry point                                              |
| `consent.png`           | `/` — this MVP has no separate consent step; the landing disclaimer is what's agreed to (see Limitations) |
| `question.png`          | `/screen/[id]` — a single PHQ-9/GAD-7 item mid-flow                                                       |
| `result.png`            | `/result/[id]` — scores, risk band, and rationale                                                         |
| `explanation.png`       | `/result/[id]` — "What your written answer showed" free-text section                                      |
| `crisis.png`            | `/support/crisis` — the static, clinician-reviewed crisis pathway                                         |
| `chat.png`              | `/support/[id]` — the bounded conversational layer, one exchange                                          |
| `resources.png`         | `/resources` — the psychoeducational resource library                                                     |
| `clinician-queue.png`   | `/clinician` — the escalation queue, logged in as the seeded admin                                        |
| `clinician-detail.png`  | `/clinician/escalations/[id]` — one seeded HIGH escalation's detail                                       |
| `privacy-dashboard.png` | `/privacy/my-data` — the seeded multi-session history user's data                                         |
| `metrics.png`           | `/admin/metrics` — latency and triage-distribution charts                                                 |

## Known limitations of MVP1

Named here deliberately, before being asked:

- **The NLP classifier is untrained.** `services/classifier/app/main.py` runs
  `_placeholder_inference`, a deterministic heuristic (a hash of the input plus a short keyword
  lexicon), not a trained transformer. It exists so the service is genuinely runnable and
  testable end to end; see [services/classifier/README.md](../services/classifier/README.md) for
  the swap plan and [README.md](../README.md#swapping-in-a-trained-classifier) for how to point
  the app at a real model once trained.
- **Notifications are mock/console-only.** `server/services/notification/` defaults to
  `ConsoleNotificationService` — `NOTIFICATION_WEBHOOK_URL` is unset by default, so an escalation
  notification is logged, not actually delivered anywhere.
- **Single-language interface.** `Resource.language` defaults to `"en"` and every authored
  resource in `content/resources/` is English-only; there is no i18n layer yet.
- **Helpline numbers are unverified placeholders.** Every entry in
  [`config/helplines.ts`](../config/helplines.ts) is marked `TODO_VERIFY` and
  `ALL_HELPLINES_VERIFIED` is `false` — see rule R10. `server/plugins/warn-unverified-helplines.ts`
  surfaces this at boot so it can't be missed.
- **No offline-first sync.** The app assumes a live connection to the server on every screen
  transition; there is no local queue-and-sync for intermittent connectivity, despite NFR2's
  low-resource-device target.
- **No containerized deployment.** By this prompt's own design — see [README.md](../README.md)'s
  Deployment section for the plain Node build/run path. A container can be added later without
  changing application code.
