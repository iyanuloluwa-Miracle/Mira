# Evaluation data dictionary

Defines every column in the four CSVs `scripts/export-evaluation-data.ts` produces (into
`data/evaluation-export/`, gitignored — see `.gitignore`'s "Participant data must never be
committed" section) and every metric name written to the `Metric` table
(`server/utils/metrics.ts`). This is the document a reviewer of the research results should be
able to check a claimed number against.

This dictionary describes **de-identified, aggregate, or synthetic evaluation data only**. It
must never describe, reference, or link to real participant-level records — see CLAUDE.md rule
R10. None of the four exports below contains free text, chat content, an email, a pseudonym, or
any other person-identifying field; the one export that names a person at all
(`tasks.csv`'s `participant_code`) is a researcher-assigned code (e.g. "P1"), never a real name,
and is only ever populated when `EVALUATION_MODE=true` and a moderated session was explicitly
started (`server/api/admin/evaluation/start.post.ts`).

## `sessions.csv` — screening-level fields (NFR3/NFR5 evidence)

One row per `ScreeningSession`, whatever its outcome — in progress, abandoned, or completed.

| Column               | Type     | Source                              | Notes                                                                                                                                                                                                    |
| -------------------- | -------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_id`         | uuid     | `ScreeningSession.id`               | Opaque identifier, not linkable to a person without database access this export never grants.                                                                                                            |
| `instrument`         | string   | `ScreeningSession.instrument`       | `PHQ9`, `GAD7`, or `COMBINED`.                                                                                                                                                                           |
| `status`             | string   | `ScreeningSession.status`           | `IN_PROGRESS`, `COMPLETED`, or `ABANDONED`.                                                                                                                                                              |
| `started_at`         | ISO 8601 | `ScreeningSession.startedAt`        |                                                                                                                                                                                                          |
| `completed_at`       | ISO 8601 | `ScreeningSession.completedAt`      | Null unless `status = COMPLETED`.                                                                                                                                                                        |
| `client_latency_ms`  | integer  | `ScreeningSession.clientLatencyMs`  | Browser-observed round trip for the completion request (network included) — see `server/api/metrics/client.post.ts`. Null if the client-timing beacon never landed (e.g. the tab closed first).          |
| `server_latency_ms`  | integer  | `ScreeningSession.serverLatencyMs`  | Server handler processing time for completion — the same value as the `screening_complete_server_ms` metric on the matching row of `latency.csv`.                                                        |
| `free_text_excluded` | boolean  | `ScreeningSession.freeTextExcluded` | True if the person explicitly chose to skip the free-text step.                                                                                                                                          |
| `phq9_total`         | integer  | `TriageResult.phq9Total`            | Null unless completed.                                                                                                                                                                                   |
| `gad7_total`         | integer  | `TriageResult.gad7Total`            | Null unless completed.                                                                                                                                                                                   |
| `phq9_band`          | string   | `TriageResult.phq9Band`             | Null unless completed.                                                                                                                                                                                   |
| `gad7_band`          | string   | `TriageResult.gad7Band`             | Null unless completed.                                                                                                                                                                                   |
| `risk_level`         | string   | `TriageResult.riskLevel`            | `MINIMAL`/`MILD`/`MODERATE`/`HIGH`/`CRISIS`. Null unless completed.                                                                                                                                      |
| `escalated`          | boolean  | `TriageResult.escalated`            | Whether this result crossed the escalation threshold — independent of whether an `Escalation` record exists (that depends on `HUMAN_REVIEW` consent, see `docs/ndpa-mapping.md`). Null unless completed. |

## `latency.csv` — raw latency observations (direct NFR3 evidence)

One row per `Metric` row — tidy/long format, deliberately not pre-aggregated, so the researcher
computes percentiles, means, or distributions in their own analysis tool rather than trusting a
number this repository already baked in. `GET /api/admin/metrics` (and the `/admin/metrics`
page) compute p50/p95/p99 server-side, using the exact same rows, for a quick screenshot-ready
summary — the two should always agree.

| Column       | Type     | Source             | Notes                                                                                                        |
| ------------ | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `metric_id`  | uuid     | `Metric.id`        |                                                                                                              |
| `name`       | string   | `Metric.name`      | See "Metric names" below for the full, exact list and what each one measures.                                |
| `value_ms`   | integer  | `Metric.valueMs`   | Milliseconds. Always ≥ 0.                                                                                    |
| `session_id` | uuid     | `Metric.sessionId` | Nullable, and not a foreign key — a metric can outlive the session it was measured on (deletion, retention). |
| `created_at` | ISO 8601 | `Metric.createdAt` |                                                                                                              |

### Metric names

Every operation gets a `_server_ms` and an `_e2e_ms` variant, except the classifier and LLM
metrics, whose `_e2e_ms` variant only exists when the underlying external call actually
happened (a pre-filtered conversation turn, for instance, never calls the LLM at all).

| Name                           | Measures                                                                                                                                                                                                                 | Recorded in                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `screening_complete_server_ms` | `POST /api/screening/[id]/complete`'s own handler processing time, start to response.                                                                                                                                    | `server/api/screening/[id]/complete.post.ts`                                                      |
| `screening_complete_e2e_ms`    | The same request's round trip as observed by the browser, network included — reported back in a follow-up call once the response has actually arrived.                                                                   | `server/api/metrics/client.post.ts`, called from `app/composables/useScreeningSession.ts`         |
| `classifier_call_server_ms`    | `POST /api/screening/[id]/text`'s own total handler time (encryption, the `FreeTextEntry` write, the classifier call, and the audit log together) — recorded whenever a classifier attempt was actually made.            | `server/api/screening/[id]/text.post.ts`                                                          |
| `classifier_call_e2e_ms`       | The classifier service call's own round trip specifically (dial to response) — only recorded when the call succeeded.                                                                                                    | `server/api/screening/[id]/text.post.ts`, value from `server/services/classifier/`                |
| `llm_turn_server_ms`           | `POST /api/conversation/[sessionId]/message`'s own total handler time (pre-filter, the LLM call when one happens, post-filter, encryption, the `ConversationTurn` write) — recorded on every call, whatever the outcome. | `server/api/conversation/[sessionId]/message.post.ts`                                             |
| `llm_turn_e2e_ms`              | The LLM provider call's own round trip specifically — only recorded when a call actually reached the provider (`outcome.kind` is `ok` or `post-filter`; a pre-filtered or session-limited turn never calls it).          | `server/api/conversation/[sessionId]/message.post.ts`, value from `server/services/conversation/` |

## `triage_distribution.csv` — risk-band counts

One row per `riskLevel` value that has ever been produced, across every completed screening
regardless of when.

| Column       | Type    | Source                                                |
| ------------ | ------- | ----------------------------------------------------- |
| `risk_level` | string  | `TriageResult.riskLevel`                              |
| `count`      | integer | `COUNT(*)` of `TriageResult` rows with that riskLevel |

## `tasks.csv` — usability-task outcomes (Section 3.8.3 evidence)

One row per task attempt during a moderated evaluation session — a `TASK_START` event paired
with the next `TASK_END` event for the same session and `task_id`. Only ever populated when
`EVALUATION_MODE=true` and a researcher ran at least one session
(`app/pages/admin/evaluation.vue`, `app/components/evaluation/EvaluationHud.vue`).
Task-completion rate = the fraction of rows with `completed = true`. Median time on task = the
median of `duration_ms`.

| Column                  | Type     | Source                                            | Notes                                                                                       |
| ----------------------- | -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `evaluation_session_id` | uuid     | `EvaluationSession.id`                            |                                                                                             |
| `participant_code`      | string   | `EvaluationSession.participantCode`               | Researcher-assigned (e.g. "P1"), entered at session start — never a real name.              |
| `task_id`               | string   | `EvaluationEvent.taskId`                          | Researcher-defined label, entered on the evaluation HUD (e.g. "task-1-complete-screening"). |
| `started_at`            | ISO 8601 | The `TASK_START` event's `createdAt`              |                                                                                             |
| `ended_at`              | ISO 8601 | The matching `TASK_END` event's `createdAt`       | Null if the sitting ended before this task did — see below.                                 |
| `duration_ms`           | integer  | `ended_at - started_at`                           | Null when `ended_at` is null.                                                               |
| `completed`             | boolean  | The matching `TASK_END` event's `completed` field | Null when `ended_at` is null — an unfinished task is evidence too, not silently dropped.    |

## What `EvaluationEvent` deliberately never records

`SCREEN_TRANSITION`, `BACK_NAVIGATION`, and `ERROR_ENCOUNTERED` events (logged automatically —
see `app/middleware/evaluation-tracking.global.ts` and `useEvaluation().logError()`'s call
sites) feed session-level navigation-pattern analysis but aren't part of any of the four exports
above; they're queryable directly from `evaluation_events` for a specific `evaluationSessionId`
if a particular session's path through the app needs closer analysis. Every field on
`EvaluationEvent` (`prisma/schema.prisma`) is a short, closed-vocabulary label — a route path, a
task id, an event type, a boolean — never a string a participant typed or said.
