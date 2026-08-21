# Classifier service

A standalone Python FastAPI service implementing component 3 (the NLP classifier): a
fine-tuned transformer that analyses optional free-text screening input as a **supplementary
signal only** (FR3). It runs out-of-process from the Nuxt app and is deployable and testable
independently.

## Where this fits

`server/services/classifier/` in the Nuxt app is the only code allowed to call this service. It
wraps the HTTP call with a fast timeout and fails closed into an "unavailable" state if this
service doesn't respond — screening must still complete successfully when the classifier is
unreachable (rule R7). The result this service returns can only ever raise a triage risk band
by at most one step, and doing so must be recorded; it can never lower a band or set one on its
own (rule R1). See [`docs/decisions/0001-rule-based-triage.md`](../../docs/decisions/0001-rule-based-triage.md).

## The contract a trained model must satisfy

Any model swapped in here — the shipped default is a mock — must be served behind this HTTP
contract so `server/services/classifier/` doesn't need to change:

**`POST /classify`**

Request body:

```json
{
  "text": "free-text string, already validated non-empty by the caller",
  "request_id": "opaque string, used for correlation only — never logged with the text (rule R4)"
}
```

Response body:

```json
{
  "signal": "elevated_risk | no_elevated_risk",
  "confidence": 0.0,
  "model_version": "identifier for the exact model artifact that produced this response"
}
```

Requirements on any implementation:

- **Never decides risk on its own.** The response is a signal consumed by
  `server/domain/triage.ts`, which may use it to raise a band by at most one step (rule R1). It
  is not a replacement for the rule-based triage engine.
- **Responds fast or fails fast.** The Nuxt-side caller times out aggressively
  (`CLASSIFIER_TIMEOUT_MS` in `.env.example`); a model that can't meet that budget should be
  optimized or moved behind a queue rather than allowed to block screening.
- **Does not log request text.** Apply the same discipline as rule R4 in the main app — no
  plaintext free text in logs, including model-side logs.
- **Reports its own version.** `model_version` must uniquely identify the model artifact, so
  evaluation results can always be tied back to exactly what produced them.
- **Ships a health endpoint** (`GET /health`) so `server/services/classifier/` can distinguish
  "slow" from "down" for the purposes of rule R7's degrade-don't-fail behavior.

## Running locally

```bash
cd services/classifier
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Or via `docker compose up classifier` from the repository root. Point the Nuxt app at it with
`CLASSIFIER_SERVICE_URL` (see [`.env.example`](../../.env.example)).

## Tests

Classifier-service tests live in `tests/` in this folder and run independently of the main
Vitest/Playwright suite — see that folder's own README.
