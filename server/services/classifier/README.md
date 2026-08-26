# server/services/classifier

Adapter to the NLP classifier service (component 3, FR3). `index.ts` exports `classify(text)`,
the only function anything else should call — it never throws, resolving instead to a
`ClassifierOutcome` (`server/domain/model-contract.ts`) of `{ status: 'ok', response }` or
`{ status: 'unavailable', reason }`.

Two `ClassifierClient` implementations, selected by `CLASSIFIER_MODE` (`config/runtime.ts`):

- `mock-classifier.ts` — deterministic, no network call. The default, so a fresh clone and the
  test suite work without services/classifier/ (the Python side) running at all.
- `http-classifier.ts` — calls services/classifier/'s `POST /predict` with a 3s timeout, one
  retry, and a circuit breaker (`circuit-breaker.ts`) that opens after 5 consecutive failures
  and half-opens after a cooldown to test recovery.

Screening must complete on instrument scores alone when the classifier is unavailable (rule
R7) — nothing here ever blocks or fails a screening; a failure just becomes
`{ status: 'unavailable' }` for the caller to render around (see
`describeClassifierOutcome` in `model-contract.ts`).
