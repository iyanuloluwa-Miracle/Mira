"""FastAPI scaffold for the classifier service (component 3, FR3).

This is a runnable, testable stand-in for the real inference endpoint -- not the trained
model. `_placeholder_inference` below is a simple deterministic heuristic, not a transformer,
and its model_version ("scaffold-placeholder-0.1") is deliberately distinct from both a real
model's version and the TS-side mock's "mock-0.1" (see server/domain/model-contract.ts), so a
placeholder response can never be mistaken for either. Swapping in the trained model means
replacing `_placeholder_inference` with real inference and updating MODEL_NAME/MODEL_VERSION --
the request/response contract (schemas.py) does not change. See README.md for the full contract
this endpoint must keep satisfying.

Training code is intentionally not here -- it lives in the separate research repo.
"""

import hashlib
import time

from fastapi import FastAPI

from .schemas import HealthResponse, PredictRequest, PredictResponse, TokenAttribution

MODEL_NAME = "mira-classifier-scaffold"
MODEL_VERSION = "scaffold-placeholder-0.1"

app = FastAPI(title="Mira classifier service")

_LEXICON: list[tuple[str, float]] = [
    ("hopeless", 0.35),
    ("worthless", 0.35),
    ("no point", 0.3),
    ("can't go on", 0.4),
    ("give up", 0.25),
    ("empty inside", 0.25),
    ("burden", 0.2),
    ("tired of everything", 0.3),
]


def _hash_to_unit_interval(text: str) -> float:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") / 0xFFFFFFFF


def _placeholder_inference(text: str) -> PredictResponse:
    """Deterministic heuristic standing in for a real model. Same shape/behavior family as the
    TS-side MockClassifier (server/services/classifier/mock-classifier.ts), reimplemented
    natively rather than shared, since the two run in different languages and processes -- this
    is what a caller talking to this service over HTTP actually receives.
    """
    start = time.monotonic()
    normalized = text.lower()

    base_probability = _hash_to_unit_interval(text) * 0.4
    matches = [
        TokenAttribution(token=term, attribution=weight)
        for term, weight in _LEXICON
        if term in normalized
    ]
    boost = sum(match.attribution for match in matches)
    probability = min(1.0, base_probability + boost)

    return PredictResponse(
        probability=probability,
        label="SYMPTOMATIC" if probability >= 0.5 else "NON_SYMPTOMATIC",
        model_name=MODEL_NAME,
        model_version=MODEL_VERSION,
        top_tokens=matches,
        latency_ms=(time.monotonic() - start) * 1000,
    )


@app.post("/predict", response_model=PredictResponse, response_model_by_alias=True)
def predict(request: PredictRequest) -> PredictResponse:
    # request.request_id is accepted for correlation but deliberately unused here -- nothing in
    # this scaffold logs it or the text (rule R4 applies model-side too, see README.md).
    return _placeholder_inference(request.text)


@app.get("/health", response_model=HealthResponse, response_model_by_alias=True)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_version=MODEL_VERSION)
