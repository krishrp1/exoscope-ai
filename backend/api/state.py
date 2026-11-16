"""Process-wide application state: sample index, loaded model, training manager, recent predictions."""
from __future__ import annotations

import json
import logging
import threading
from collections import deque
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
import pandas as pd

from backend.ml import config
from backend.ml import dataset as ds
from backend.ml import predict as predict_mod
from backend.ml.preprocessing import load_processed

from .training_manager import TrainingManager

logger = logging.getLogger("exoscope.state")

SAMPLE_COLUMNS = ["kepoi_name", "kepid", "kepler_name", "koi_disposition", "koi_period", "koi_time0bk",
                  "koi_duration", "koi_depth", "koi_prad", "koi_model_snr", "koi_kepmag", "koi_teq",
                  "koi_steff", "ra", "dec"]


@lru_cache(maxsize=24)
def cached_lightcurve(kepid: int) -> dict[str, np.ndarray]:
    return ds.load_lightcurve(kepid)


class AppState:
    def __init__(self) -> None:
        self.samples = pd.DataFrame(columns=SAMPLE_COLUMNS + ["split"])
        self.processed_report: dict = {}
        self.dataset_error: str | None = None
        self.recent_predictions: deque[dict] = deque(maxlen=50)
        self.training = TrainingManager(on_completed=self.reload_after_training)
        self._lock = threading.Lock()

    # ------------------------------------------------------------ dataset

    def refresh_samples(self) -> None:
        """Rebuild the index of KOIs that have a fetched light curve."""
        try:
            koi = ds.load_koi_with_lightcurves(include_candidates=True)
            df = koi[[c for c in SAMPLE_COLUMNS if c in koi.columns]].copy()
            split = pd.Series("not processed", index=df.index)
            split[df["koi_disposition"] == config.UNLABELED_CLASS] = "unlabeled"
            self.processed_report = {}
            if config.PROCESSED_PATH.exists():
                data, _ = load_processed()
                mapping = dict(zip(data["kepoi_name"].tolist(), data["split"].tolist()))
                mapped = df["kepoi_name"].map(mapping)
                split = mapped.where(mapped.notna(), split)
                self.processed_report = data["report"]
            df["split"] = split.to_numpy()
            with self._lock:
                self.samples = df.reset_index(drop=True)
                self.dataset_error = None
            cached_lightcurve.cache_clear()
        except Exception as exc:
            logger.exception("could not build the sample index")
            self.dataset_error = f"{type(exc).__name__}: {exc}"

    def get_sample(self, sample_id: str) -> pd.Series | None:
        rows = self.samples[self.samples["kepoi_name"] == sample_id]
        return None if rows.empty else rows.iloc[0]

    # ------------------------------------------------------------ model

    @property
    def predictor(self):
        return predict_mod._predictor

    def load_model(self) -> None:
        predictor = predict_mod.reload_predictor()
        logger.info("model loaded" if predictor else "no trained model on disk yet")

    def reload_after_training(self) -> None:
        self.load_model()
        self.refresh_samples()

    def read_artifact(self, name: str) -> dict | None:
        path = config.ARTIFACTS_DIR / name
        if not path.exists():
            return None
        return json.loads(path.read_text())

    # ------------------------------------------------------------ predictions log

    def record_prediction(self, result: dict, source: dict) -> None:
        self.recent_predictions.appendleft({
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source_type": source.get("type"),
            "name": source.get("name"),
            "dataset_label": source.get("dataset_label"),
            "predicted_class": result["predicted_class"],
            "confidence": result["confidence"],
            "total_ms": result["processing"]["total_ms"],
        })


state = AppState()
