"""Pydantic request models. Responses are plain JSON objects documented in the README."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

ExplainMethod = Literal["saliency", "integrated_gradients", "occlusion"]


class PredictRequest(BaseModel):
    """Classify either a dataset sample (`sample_id`) or an inline light curve (`flux`, optional `time`)."""
    sample_id: str | None = Field(None, description="KOI name from the dataset, e.g. K00752.01")
    time: list[float | None] | None = Field(None, description="Time stamps in days")
    flux: list[float | None] | None = Field(None, description="Flux values (any unit)")
    period: float | None = Field(None, gt=0, description="Orbital period in days")
    t0: float | None = Field(None, description="Time of one mid-transit, same time system as `time`")
    duration_hours: float | None = Field(None, gt=0, description="Transit duration in hours")
    explain: bool = True
    methods: list[ExplainMethod] | None = None

    @model_validator(mode="after")
    def _one_input(self):
        if (self.sample_id is None) == (self.flux is None):
            raise ValueError("provide exactly one of `sample_id` or `flux`")
        if self.time is not None and self.flux is not None and len(self.time) != len(self.flux):
            raise ValueError("`time` and `flux` must have the same length")
        return self


class BatchPredictRequest(BaseModel):
    sample_ids: list[str] = Field(..., min_length=1)
    explain: bool = False


class TrainingStartRequest(BaseModel):
    epochs: int = Field(60, ge=1, le=300)
    batch_size: int = Field(64, ge=8, le=512)
    learning_rate: float = Field(1e-3, gt=0, le=0.1)
    dropout: float = Field(0.3, ge=0, lt=0.9)
    augment: bool = True
