"""Prediction endpoints: dataset samples, inline arrays, CSV uploads and batches."""
from __future__ import annotations

import threading
import time as _time

import numpy as np
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from backend.ml import config
from backend.ml.preprocessing import PreprocessingError

from . import uploads
from .errors import ApiError
from .routes_dataset import PROVENANCE, _clean, sample_to_dict
from .schemas import BatchPredictRequest, PredictRequest
from .settings import get_settings
from .state import cached_lightcurve, state

router = APIRouter(prefix="/api", tags=["predict"])


def _require_model():
    predictor = state.predictor
    if predictor is None:
        raise ApiError(409, "model_not_trained", "No trained model is available. Train the model first.")
    return predictor


# At most 2 predictions at once: each runs TensorFlow (and attributions), and the free instance has 512 MB.
_slots = threading.BoundedSemaphore(2)


def _run(predictor, **kwargs) -> dict:
    if not _slots.acquire(blocking=False):
        raise ApiError(503, "server_busy", "The server is busy with other predictions. Try again in a few seconds.")
    try:
        return predictor.predict(**kwargs)
    except PreprocessingError as exc:
        raise ApiError(422, "cannot_process", f"The light curve could not be processed: {exc}")
    finally:
        _slots.release()


def predict_sample(sample_id: str, explain: bool, methods: list[str] | None) -> dict:
    predictor = _require_model()
    row = state.get_sample(sample_id)
    if row is None:
        raise ApiError(404, "sample_not_found", f"No dataset sample with id '{sample_id}' has a light curve.")
    lc = cached_lightcurve(int(row["kepid"]))
    result = _run(predictor, flux=lc["flux"], time=lc["time"], period=float(row["koi_period"]),
                  t0=float(row["koi_time0bk"]), duration_hours=float(row["koi_duration"]),
                  quarter=lc["quarter"], with_explanation=explain, explain_methods=methods)
    result["ephemeris"]["source"] = "Kaggle KOI catalog"
    label = _clean(row["koi_disposition"])
    result["source"] = {
        "type": "dataset_sample", "name": sample_id, "sample": sample_to_dict(row),
        "dataset_label": label, "split": row["split"],
        "label_is_resolved": label in config.CLASS_NAMES,
        "agrees_with_label": (result["predicted_class"] == label) if label in config.CLASS_NAMES else None,
        "seen_in_training": bool(row["split"] == "train"),
        "provenance": PROVENANCE,
    }
    state.record_prediction(result, result["source"])
    return result


@router.post("/predict")
async def predict(req: PredictRequest) -> dict:
    if req.sample_id is not None:
        return await run_in_threadpool(predict_sample, req.sample_id, req.explain, req.methods)
    predictor = _require_model()
    settings = get_settings()
    if len(req.flux) > settings.max_inline_points:
        raise ApiError(413, "too_many_points", f"At most {settings.max_inline_points:,} points are accepted.")
    flux = np.array([np.nan if v is None else v for v in req.flux], dtype=np.float64)
    time = None if req.time is None else np.array([np.nan if v is None else v for v in req.time], dtype=np.float64)
    result = await run_in_threadpool(_run, predictor, flux=flux, time=time, period=req.period, t0=req.t0,
                                     duration_hours=req.duration_hours, with_explanation=req.explain,
                                     explain_methods=req.methods)
    result["source"] = {"type": "inline", "name": "inline light curve", "dataset_label": None,
                        "provenance": {"light_curves": {"label": "User-supplied data",
                                                        "source": "sent in the request body"}}}
    state.record_prediction(result, result["source"])
    return result


async def _read_upload(file: UploadFile) -> bytes:
    settings = get_settings()
    content = await file.read(settings.max_upload_bytes + 1)
    uploads.validate_upload_meta(file.filename, file.content_type, len(content), settings.max_upload_bytes)
    return content


@router.post("/predict/upload/inspect")
async def inspect_upload(file: UploadFile = File(...)) -> dict:
    """Parse an uploaded CSV and report its columns so the client can map time and flux."""
    content = await _read_upload(file)
    df = await run_in_threadpool(uploads.parse_csv, content, get_settings().max_upload_rows)
    return {"filename": file.filename, "size_bytes": len(content), **uploads.inspect(df)}


@router.post("/predict/upload")
async def predict_upload(
    file: UploadFile = File(...),
    time_column: str | None = Form(None),
    flux_column: str | None = Form(None),
    period: float | None = Form(None, gt=0),
    t0: float | None = Form(None),
    duration_hours: float | None = Form(None, gt=0),
    explain: bool = Form(True),
) -> dict:
    started = _time.perf_counter()
    content = await _read_upload(file)
    predictor = _require_model()
    df = await run_in_threadpool(uploads.parse_csv, content, get_settings().max_upload_rows)
    time, flux, mapping = uploads.extract_series(df, time_column or None, flux_column or None)
    parse_ms = round((_time.perf_counter() - started) * 1000, 3)
    result = await run_in_threadpool(_run, predictor, flux=flux, time=time, period=period, t0=t0,
                                     duration_hours=duration_hours, with_explanation=explain)
    result["processing"]["stages_ms"]["loading"] = round(result["processing"]["stages_ms"]["loading"] + parse_ms, 3)
    result["processing"]["total_ms"] = round(sum(result["processing"]["stages_ms"].values()), 3)
    result["upload"] = {"filename": file.filename, "size_bytes": len(content), **mapping}
    result["source"] = {"type": "upload", "name": file.filename, "dataset_label": None,
                        "provenance": {"light_curves": {"label": "User-uploaded data",
                                                        "source": "uploaded file; origin not verified"}}}
    state.record_prediction(result, result["source"])
    return result


@router.post("/predict/batch")
async def predict_batch(req: BatchPredictRequest) -> dict:
    settings = get_settings()
    if len(req.sample_ids) > settings.max_batch_size:
        raise ApiError(413, "batch_too_large", f"At most {settings.max_batch_size} samples per batch.")
    _require_model()

    def run_all() -> list[dict]:
        out = []
        for sid in req.sample_ids:
            try:
                r = predict_sample(sid, req.explain, None)
                item = {"sample_id": sid, "ok": True, **{k: r[k] for k in (
                    "predicted_class", "confidence", "probabilities", "processing", "source", "signal", "ephemeris")},
                    "processed": {k: r["processed"][k] for k in ("global_view", "local_view")}}
                if req.explain:
                    item["explanation"] = r["explanation"]
                out.append(item)
            except ApiError as exc:
                out.append({"sample_id": sid, "ok": False, "error": {"code": exc.code, "message": exc.message}})
        return out

    results = await run_in_threadpool(run_all)
    return {"count": len(results), "n_ok": sum(r["ok"] for r in results), "results": results}


@router.get("/predictions/recent")
def recent_predictions() -> dict:
    return {"items": list(state.recent_predictions),
            "note": "Predictions made since this server process started (kept in memory, newest first)."}
