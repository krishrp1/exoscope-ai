"""Model status, metrics and evaluation plots."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from backend.ml import config
from backend.ml.explainability import METHODS
from backend.ml.predict import SOFTMAX_DISCLAIMER

from .errors import ApiError
from .state import state

router = APIRouter(prefix="/api/model", tags=["model"])


@router.get("/status")
def model_status() -> dict:
    predictor = state.predictor
    if predictor is None:
        return {"trained": False, "message": "No trained model yet. Start a training run to create one.",
                "class_names": config.CLASS_NAMES}
    metrics = state.read_artifact("metrics.json") or {}
    test = metrics.get("test", {})
    return {
        "trained": True,
        "trained_at": metrics.get("trained_at"),
        "class_names": predictor.class_names,
        "positive_class": config.POSITIVE_CLASS,
        "architecture": {k: predictor.model_config.get(k) for k in ("name", "input_shape", "output_shape",
                                                                     "total_params", "layers")},
        "train_params": predictor.model_config.get("train_params"),
        "preprocessing": predictor.preprocess_config.to_dict(),
        "standardizer": {"fitted_on": "training split only", "n_fit_samples": predictor.standardizer.n_fit_samples},
        "explanation_methods": METHODS,
        "summary": {k: test.get(k) for k in ("accuracy", "precision", "recall", "f1", "roc_auc", "pr_auc",
                                             "n_samples", "n_positive")},
        "epochs_run": metrics.get("epochs_run"),
        "best_epoch": metrics.get("best_epoch"),
        "disclaimer": SOFTMAX_DISCLAIMER,
    }


@router.get("/metrics")
def model_metrics() -> dict:
    metrics = state.read_artifact("metrics.json")
    if metrics is None:
        return {"trained": False, "message": "No evaluation metrics yet. Train the model first."}
    history = state.read_artifact("training_history.json") or {}
    plots = sorted(p.name for p in (config.ARTIFACTS_DIR / "plots").glob("*.png"))
    return {"trained": True, "metrics": metrics, "history": history.get("history"),
            "train_params": history.get("params"), "plots": plots,
            "note": "All values were computed on the held-out test split by backend/ml/evaluate.py."}


@router.get("/plots/{name}")
def model_plot(name: str):
    allowed = {p.name: p for p in (config.ARTIFACTS_DIR / "plots").glob("*.png")}
    if name not in allowed:
        raise ApiError(404, "plot_not_found", f"No plot named '{name}'.", {"available": sorted(allowed)})
    return FileResponse(allowed[name], media_type="image/png")
