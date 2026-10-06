# Classifier service

A standalone Python FastAPI service implementing component 3 (the NLP classifier): a
fine-tuned transformer that analyses optional free-text screening input as a **supplementary
signal only** (FR3). It runs out-of-process from the Nuxt app and is deployable and testable
independently.

## Where this fits

`server/services/classifier/` in the Nuxt app is the only code allowed to call this service. It
wraps the HTTP call with a fast timeout, one retry, and a circuit breaker, and fails closed into
an "unavailable" state if this service doesn't respond — screening must still complete
successfully when the classifier is unreachable (rule R7). Any result this service returns can
only ever raise a triage risk band by at most one step, and doing so must be recorded; it can
never lower a band or set one on its own (rule R1). See
[`docs/decisions/0001-rule-based-triage.md`](../../docs/decisions/0001-rule-based-triage.md).

The exact request/response shape is defined once, as TypeScript types, in
[`server/domain/model-contract.ts`](../../server/domain/model-contract.ts) — this document and
`app/schemas.py` in this folder must stay in sync with it.

## The contract a trained model must satisfy

Any model swapped in here — the shipped default is a placeholder heuristic, not a trained model
— must be served behind this HTTP contract so `server/services/classifier/` doesn't need to
change. Field names are camelCase on the wire; `app/schemas.py`'s `CamelModel` base handles that
translation from Python's snake_case attribute names automatically.

**`POST /predict`**

Request body:

```json
{
  "text": "free-text string, already validated non-empty by the caller",
  "requestId": "opaque string, used for correlation only — never logged with the text (rule R4)"
}
```

Response body:

```json
{
  "probability": 0.0,
  "label": "SYMPTOMATIC | NON_SYMPTOMATIC",
  "modelName": "identifier for the model architecture/family",
  "modelVersion": "identifier for the exact model artifact that produced this response",
  "topTokens": [{ "token": "string", "attribution": 0.0 }],
  "latencyMs": 0.0
}
```

`topTokens` is what makes a SYMPTOMATIC label explainable (NFR5) rather than a bare number — the
tokens/spans that most influenced the prediction, however the model chooses to compute that
(attention weights, integrated gradients, SHAP, etc.). An empty array is acceptable if the model
genuinely has nothing to attribute; it should not be fabricated to look non-empty.

**`GET /health`**

```json
{ "status": "ok", "modelVersion": "identifier for the exact model artifact currently loaded" }
```

Requirements on any implementation:

- **Never decides risk on its own.** The response is a signal consumed by
  `server/domain/triage.ts`, which may use it to raise a band by at most one step (rule R1). It
  is not a replacement for the rule-based triage engine.
- **Responds fast or fails fast.** The Nuxt-side caller times out aggressively
  (`CLASSIFIER_TIMEOUT_MS` in `.env.example`, 3s by default) and retries once; a model that
  can't meet that budget should be optimized or moved behind a queue rather than allowed to
  block screening.
- **Does not log request text or requestId alongside it.** Apply the same discipline as rule R4
  in the main app — no plaintext free text in logs, model-side included.
- **Reports its own version**, both in `/predict` responses and `/health`, so evaluation results
  can always be tied back to exactly what produced them. A mock or placeholder response must
  never report a version that could be mistaken for a real model's — see `MOCK_MODEL_VERSION`
  ("mock-0.1") in `model-contract.ts` and `MODEL_VERSION` ("scaffold-placeholder-0.1") in
  `app/main.py`; a real trained model gets its own distinct version string.
- **Ships a health endpoint** so `server/services/classifier/` can distinguish "slow" from
  "down" for the purposes of rule R7's degrade-don't-fail behavior.

## What's actually implemented right now

`app/main.py` runs `_placeholder_inference`: a small deterministic heuristic (a hash of the
input plus a short keyword lexicon), not a transformer. It exists so this service is genuinely
runnable and testable end to end before the trained model is ready. Swapping in the real model
means replacing `_placeholder_inference` and updating `MODEL_NAME`/`MODEL_VERSION` — the FastAPI
routes and `schemas.py` do not need to change. **Training code is not here** — it lives in the
separate research repo; this folder only ever holds inference-serving code.

## Running locally

```bash
cd services/classifier
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Or, from the repository root, `npm run classifier` (starts this service from its
`.venv`, created by `npm run setup`). Point the Nuxt app at it by
setting `CLASSIFIER_MODE="http"` and `CLASSIFIER_SERVICE_URL` (see
[`.env.example`](../../.env.example)) — `CLASSIFIER_MODE` defaults to `"mock"`, which uses
`server/services/classifier/mock-classifier.ts` instead and never calls this service at all.

## Tests

```bash
cd services/classifier
pytest
```

Runs independently of the main Vitest/Playwright suite (`vitest.config.ts` excludes
`services/classifier/**` entirely).
