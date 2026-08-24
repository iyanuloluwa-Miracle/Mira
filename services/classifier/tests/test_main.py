"""Tests for the classifier scaffold. Run independently of the main Vitest/Playwright suite:

    cd services/classifier
    pip install -r requirements.txt
    pytest
"""

from fastapi.testclient import TestClient

from app.main import MODEL_VERSION, app

client = TestClient(app)


def test_health_reports_ok_and_the_scaffold_model_version():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["modelVersion"] == MODEL_VERSION


def test_predict_returns_the_full_contract_shape():
    response = client.post("/predict", json={"text": "feeling okay today", "requestId": "abc-123"})
    assert response.status_code == 200
    body = response.json()

    assert 0.0 <= body["probability"] <= 1.0
    assert body["label"] in ("SYMPTOMATIC", "NON_SYMPTOMATIC")
    assert body["modelVersion"] == MODEL_VERSION
    assert isinstance(body["topTokens"], list)
    assert body["latencyMs"] >= 0


def test_predict_is_deterministic_for_the_same_text():
    first = client.post("/predict", json={"text": "same input twice", "requestId": "a"})
    second = client.post("/predict", json={"text": "same input twice", "requestId": "b"})

    assert first.json()["probability"] == second.json()["probability"]
    assert first.json()["label"] == second.json()["label"]


def test_lexicon_terms_push_the_label_toward_symptomatic():
    neutral = client.post("/predict", json={"text": "the weather is nice", "requestId": "a"})
    concerning = client.post(
        "/predict",
        json={"text": "I feel hopeless and worthless", "requestId": "b"},
    )

    assert concerning.json()["probability"] > neutral.json()["probability"]
    assert concerning.json()["label"] == "SYMPTOMATIC"
    tokens = {t["token"] for t in concerning.json()["topTokens"]}
    assert {"hopeless", "worthless"}.issubset(tokens)


def test_predict_rejects_a_missing_text_field():
    response = client.post("/predict", json={"requestId": "abc-123"})
    assert response.status_code == 422
