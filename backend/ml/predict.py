"""Inference: load the saved model once and classify light curves.

Uses exactly the same preprocessing code as training (`process_light_curve`)
and the standardizer saved from the training split.
"""
from __future__ import annotations

import json
import threading
import time as _time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import config
from .explainability import explain
from .preprocessing import (PreprocessConfig, PreprocessingError, ProcessedCurve, Standardizer,
                            estimate_ephemeris, flatten_series, fold_and_bin)

WEAK_BLS_SNR = 7.1  # the Kepler pipeline's detection threshold; below it an estimated period is doubtful

SOFTMAX_DISCLAIMER = (
    "The score is the model's softmax output for this input. It is not the probability that the "
    "object is a confirmed planet, and it is not a substitute for astronomical vetting.")
EXPLANATION_DISCLAIMER = (
    "Attributions explain which parts of the input influenced the model. They are not confirmed "
    "physical transit detections.")


class ModelNotTrainedError(RuntimeError):
    """No saved model is available yet."""


@dataclass
class Predictor:
    model: object
    preprocess_config: PreprocessConfig
    standardizer: Standardizer
    class_names: list[str]
    model_config: dict
    loaded_at: float

    @classmethod
    def load(cls, models_dir: Path | None = None, artifacts_dir: Path | None = None) -> "Predictor":
        import keras

        models_dir = Path(models_dir or config.SAVED_MODELS_DIR)
        model_path = models_dir / "model.keras"
        if not model_path.exists():
            raise ModelNotTrainedError(f"no trained model at {model_path}")
        pre = json.loads((models_dir / "preprocessing_config.json").read_text())
        labels = json.loads((models_dir / "label_mapping.json").read_text())
        index_to_class = labels["index_to_class"]
        return cls(
            model=keras.models.load_model(model_path),
            preprocess_config=PreprocessConfig.from_dict(pre["preprocess"]),
            standardizer=Standardizer.from_dict(pre["standardizer"]),
            class_names=[index_to_class[str(i)] for i in range(len(index_to_class))],
            model_config=json.loads((models_dir / "model_config.json").read_text()),
            loaded_at=_time.time(),
        )

    # ------------------------------------------------------------ low level

    def predict_views(self, views: np.ndarray) -> np.ndarray:
        """Class probabilities for un-standardized views of shape (N, n_bins, 2)."""
        views = np.asarray(views, dtype=np.float32)
        if views.ndim == 2:
            views = views[None]
        return np.asarray(self.model(self.standardizer.transform(views), training=False))

    def baseline(self) -> np.ndarray:
        """Standardized representation of a flat (no dip) light curve; the explanation baseline."""
        n_bins = self.preprocess_config.n_bins
        return self.standardizer.transform(np.zeros((1, n_bins, 2), dtype=np.float32))[0]

    # ------------------------------------------------------------ high level

    def predict(self, flux, time=None, period: float | None = None, t0: float | None = None,
                duration_hours: float | None = None, quarter=None, explain_methods: list[str] | None = None,
                with_explanation: bool = True) -> dict:
        """Classify one light curve.

        If no ephemeris (period, t0, duration) is supplied it is estimated with
        Box Least Squares and reported as an estimate. Returns probabilities,
        the processed signal, explanations and real per-stage timings.
        """
        timings: dict[str, float] = {}

        def stage(name: str, started: float) -> None:
            timings[name] = round((_time.perf_counter() - started) * 1000, 3)

        warnings: list[str] = []
        cfg = self.preprocess_config

        s = _time.perf_counter()
        flux = np.asarray(flux, dtype=np.float64).ravel()
        time_arr = None if time is None else np.asarray(time, dtype=np.float64).ravel()
        stage("loading", s)

        s = _time.perf_counter()  # input checks: shapes and the number of usable observations
        if time_arr is not None and len(time_arr) != len(flux):
            raise PreprocessingError(f"time and flux have different lengths ({len(time_arr)} vs {len(flux)})")
        usable = np.isfinite(flux) if time_arr is None else np.isfinite(flux) & np.isfinite(time_arr)
        if int(usable.sum()) < cfg.min_points:
            raise PreprocessingError(
                f"only {int(usable.sum())} valid observations after removing missing values; "
                f"need at least {cfg.min_points}")
        stage("validating", s)

        if period is None or t0 is None or duration_hours is None:
            s = _time.perf_counter()
            est = estimate_ephemeris(time_arr, flux, cfg)
            period, t0, duration_hours = est["period"], est["t0"], est["duration_hours"]
            ephemeris = {**est, "source": "estimated", "note": (
                "Estimated from the uploaded light curve. The model was trained on catalog ephemerides, "
                "so results for estimated ephemerides are less reliable.")}
            if est["bls_snr"] < WEAK_BLS_SNR:
                warnings.append(f"The periodic signal is weak (BLS signal-to-noise {est['bls_snr']:.1f}); "
                                "the estimated period may be wrong, so treat this result with caution.")
            stage("ephemeris_search", s)
        else:
            ephemeris = {"period": float(period), "t0": float(t0), "duration_hours": float(duration_hours),
                         "source": "provided"}

        s = _time.perf_counter()  # clean, segment, detrend, clip
        series = flatten_series(time_arr, flux, period, t0, duration_hours, quarter=quarter, cfg=cfg)
        stage("normalizing", s)

        s = _time.perf_counter()  # fold, bin into the two views, standardize
        pc = fold_and_bin(series, period, t0, duration_hours, cfg=cfg)
        x = self.standardizer.transform(pc.views[None])[0]
        if not pc.views[:, 1].any():
            warnings.append("No dip was found at this ephemeris: the model input is flat, "
                            "so the score says little about this light curve.")
        stage("extracting_features", s)

        s = _time.perf_counter()
        probs = np.asarray(self.model(x[None], training=False))[0]
        stage("cnn_inference", s)

        s = _time.perf_counter()
        pred = int(np.argmax(probs))
        result = {
            "predicted_class": self.class_names[pred],
            "predicted_index": pred,
            "confidence": float(probs[pred]),
            "probabilities": {name: float(p) for name, p in zip(self.class_names, probs)},
            "ephemeris": ephemeris,
            "processed": processed_to_dict(pc),
            "signal": pc.stats,
            "warnings": warnings,
            "disclaimer": SOFTMAX_DISCLAIMER,
        }
        if with_explanation:
            exp = explain(self.model, x, self.baseline(), pred, explain_methods)
            result["explanation"] = {
                "target_class": self.class_names[pred],
                "disclaimer": EXPLANATION_DISCLAIMER,
                "channels": ["global view", "local view"],
                "methods": {name: {"label": e["label"],
                                   "global": e["attribution"][:, 0].astype(float).tolist(),
                                   "local": e["attribution"][:, 1].astype(float).tolist()}
                            for name, e in exp.items()},
            }
        stage("preparing_results", s)
        result["processing"] = {"stages_ms": timings, "total_ms": round(sum(timings.values()), 3),
                                "stage_order": list(timings)}
        return result


def processed_to_dict(pc: ProcessedCurve, max_folded_points: int = 4000) -> dict:
    """JSON-ready processed signal. The folded scatter is thinned evenly for transport only."""
    n = len(pc.phase)
    idx = np.arange(n) if n <= max_folded_points else np.linspace(0, n - 1, max_folded_points).round().astype(int)
    order = idx[np.argsort(pc.phase[idx])]
    return {
        "global_view": {"phase": pc.global_phase.tolist(), "flux": pc.views[:, 0].astype(float).tolist()},
        "local_view": {"hours_from_mid_transit": pc.local_time_hours.tolist(),
                       "flux": pc.views[:, 1].astype(float).tolist()},
        "folded": {"phase": pc.phase[order].tolist(), "flux": pc.flux_normalized[order].tolist(),
                   "n_total": int(n), "n_shown": int(len(order))},
        "view_normalization": "per view: median 0, deepest bin -1",
    }


_predictor: Predictor | None = None
_lock = threading.Lock()


def get_predictor() -> Predictor:
    """Process-wide predictor, loaded on first use and reused afterwards."""
    global _predictor
    with _lock:
        if _predictor is None:
            _predictor = Predictor.load()
        return _predictor


def reload_predictor() -> Predictor | None:
    """Load the model on disk into the shared slot (used after a training run). None if untrained."""
    global _predictor
    with _lock:
        try:
            _predictor = Predictor.load()
        except ModelNotTrainedError:
            _predictor = None
        return _predictor


def predict(flux, time=None, **kwargs) -> dict:
    """Module-level convenience: class probabilities and more for one light curve."""
    return get_predictor().predict(flux, time=time, **kwargs)
