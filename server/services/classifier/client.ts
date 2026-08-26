// The one interface both classifier implementations satisfy — kept separate from index.ts so
// mock-classifier.ts and http-classifier.ts can both import it without importing each other.

import type { ClassifierRequest, ClassifierResponse } from '../../domain/model-contract'

export interface ClassifierClient {
  // Throws on any failure (network error, timeout, non-2xx, malformed response, circuit open).
  // index.ts's classify() is what turns that into the never-throws ClassifierOutcome contract
  // callers actually see.
  classify(request: ClassifierRequest): Promise<ClassifierResponse>
}
