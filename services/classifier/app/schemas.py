"""Request/response models for the /predict endpoint.

Field names are camelCase on the wire (via `alias_generator`) to match
server/domain/model-contract.ts exactly -- the Nuxt-side HttpClassifier sends and expects
camelCase JSON with no translation layer in between. Python attribute names stay snake_case,
which is what `populate_by_name=True` is for: construct instances either way in code, but
`model_dump(by_alias=True)` (used when returning a response) always emits camelCase.
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PredictRequest(CamelModel):
    text: str
    # Opaque, used for correlation only -- never logged alongside the text (rule R4).
    request_id: str


class TokenAttribution(CamelModel):
    token: str
    attribution: float


class PredictResponse(CamelModel):
    probability: float = Field(ge=0.0, le=1.0)
    label: str  # "SYMPTOMATIC" | "NON_SYMPTOMATIC"
    model_name: str
    model_version: str
    top_tokens: list[TokenAttribution]
    latency_ms: float


class HealthResponse(CamelModel):
    status: str
    model_version: str
