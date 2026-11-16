"""Dataset endpoints: statistics, sample listing and per-sample light curves."""
from __future__ import annotations

from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query

from backend.ml import config
from backend.ml import dataset as ds
from backend.ml.predict import processed_to_dict
from backend.ml.preprocessing import PreprocessConfig, PreprocessingError, process_light_curve

from .errors import ApiError
from .state import cached_lightcurve, state

router = APIRouter(prefix="/api/dataset", tags=["dataset"])

PROVENANCE = {
    "catalog": {"label": config.PROVENANCE_KAGGLE, "source": f"Kaggle dataset {config.KAGGLE_DATASET} (NASA Exoplanet Archive KOI cumulative table)"},
    "light_curves": {"label": config.PROVENANCE_MAST, "source": "NASA Kepler long-cadence PDCSAP light curves from MAST (public S3 mirror)"},
}
SORTABLE = {"kepoi_name", "kepid", "koi_disposition", "koi_period", "koi_duration", "koi_depth",
            "koi_prad", "koi_model_snr", "koi_kepmag", "split"}


def _clean(value):
    """JSON-safe scalar: NaN -> None, numpy types -> python."""
    if value is None or (isinstance(value, float) and not np.isfinite(value)):
        return None
    if isinstance(value, (np.floating, np.integer)):
        value = value.item()
        return None if isinstance(value, float) and not np.isfinite(value) else value
    if pd.isna(value):
        return None
    return value


def sample_to_dict(row: pd.Series) -> dict:
    d = {k: _clean(v) for k, v in row.to_dict().items()}
    d["id"] = d["kepoi_name"]
    d["is_labelled"] = d["koi_disposition"] in config.CLASS_NAMES
    return d


def _counts(series: pd.Series) -> dict:
    return {str(k): int(v) for k, v in series.value_counts().items()}


@router.get("/stats")
def dataset_stats() -> dict:
    """Live statistics. Every number is computed from the files on disk when the endpoint is called."""
    try:
        koi = ds.load_koi_table()
    except Exception as exc:
        raise ApiError(503, "dataset_unavailable", f"The Kaggle catalog could not be loaded: {exc}")
    manifest = ds.load_manifest()
    samples = state.samples
    ok = manifest[manifest["status"] == "ok"] if not manifest.empty else manifest
    labelled = koi[koi[config.LABEL_COLUMN].isin(config.CLASS_NAMES)]
    eph = ["koi_period", "koi_time0bk", "koi_duration"]
    missing_eph = int((~np.isfinite(koi[eph]).all(axis=1)).sum())
    report = state.processed_report
    return {
        "catalog": {
            "n_koi": int(len(koi)),
            "n_columns": int(koi.shape[1]),
            "n_targets": int(koi["kepid"].nunique()),
            "class_counts": _counts(koi[config.LABEL_COLUMN]),
            "labelled_class_counts": _counts(labelled[config.LABEL_COLUMN]),
            "positive_class": config.POSITIVE_CLASS,
            "positive_fraction_of_labelled": float((labelled[config.LABEL_COLUMN] == config.POSITIVE_CLASS).mean()),
            "provenance": PROVENANCE["catalog"],
        },
        "light_curves": {
            "n_targets_available": int(len(ds.available_kepids())),
            "n_koi_available": int(len(samples)),
            "class_counts": _counts(samples["koi_disposition"]) if len(samples) else {},
            "n_observations_total": int(ok["n_points"].sum()) if len(ok) else 0,
            "median_observations_per_target": float(ok["n_points"].median()) if len(ok) else None,
            "median_time_span_days": float((ok["t_end"] - ok["t_start"]).median()) if len(ok) else None,
            "median_quarters_per_target": float(ok["n_quarters"].median()) if len(ok) else None,
            "provenance": PROVENANCE["light_curves"],
        },
        "splits": {name: {"n_samples": int((samples["split"] == name).sum()),
                          "class_counts": _counts(samples[samples["split"] == name]["koi_disposition"])}
                   for name in ("train", "val", "test", "unlabeled", "not processed")} if len(samples) else {},
        "health": {
            "n_exact_duplicate_rows": int(koi.duplicated().sum()),
            "n_duplicate_koi_names": int(koi["kepoi_name"].duplicated().sum()),
            "n_koi_missing_ephemeris": missing_eph,
            "n_columns_with_missing_values": int((koi.isna().sum() > 0).sum()),
            "n_columns_entirely_missing": int((koi.isna().sum() == len(koi)).sum()),
            "fetch_status_counts": _counts(manifest["status"]) if not manifest.empty else {},
            "n_processing_failures": report.get("n_failed"),
            "n_processed": report.get("n_processed"),
            "split_by": "Kepler target (kepid); no star appears in more than one split",
        },
        "synthetic_data_used": False,
        "dataset_error": state.dataset_error,
    }


@router.get("/samples")
def list_samples(
    search: str | None = Query(None, max_length=64, description="matches KOI name, Kepler name or KIC id"),
    disposition: str | None = Query(None, description="CONFIRMED, FALSE POSITIVE or CANDIDATE"),
    split: str | None = Query(None, description="train, val, test, unlabeled"),
    sort: str = "kepoi_name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
) -> dict:
    df = state.samples
    if sort not in SORTABLE:
        raise ApiError(422, "invalid_sort", f"Cannot sort by '{sort}'.", {"allowed": sorted(SORTABLE)})
    if disposition:
        df = df[df["koi_disposition"] == disposition.upper()]
    if split:
        df = df[df["split"] == split]
    if search:
        q = search.strip().lower()
        mask = (df["kepoi_name"].str.lower().str.contains(q, regex=False)
                | df["kepler_name"].fillna("").str.lower().str.contains(q, regex=False)
                | df["kepid"].astype(str).str.contains(q, regex=False))
        df = df[mask]
    df = df.sort_values(sort, ascending=order == "asc", na_position="last", kind="stable")
    total = int(len(df))
    start = (page - 1) * page_size
    return {
        "total": total, "page": page, "page_size": page_size, "pages": int(np.ceil(total / page_size)) if total else 0,
        "items": [sample_to_dict(r) for _, r in df.iloc[start:start + page_size].iterrows()],
        "provenance": PROVENANCE,
    }


def _decimate(n: int, max_points: int) -> np.ndarray:
    if max_points <= 0 or n <= max_points:
        return np.arange(n)
    return np.unique(np.linspace(0, n - 1, max_points).round().astype(np.int64))


@router.get("/samples/{sample_id}")
def get_sample(
    sample_id: str,
    mode: Literal["raw", "normalized"] = "raw",
    max_points: int = Query(20000, ge=0, le=200000, description="0 returns every observation"),
    include_views: bool = True,
) -> dict:
    row = state.get_sample(sample_id)
    if row is None:
        raise ApiError(404, "sample_not_found", f"No dataset sample with id '{sample_id}' has a light curve.")
    try:
        lc = cached_lightcurve(int(row["kepid"]))
    except FileNotFoundError:
        raise ApiError(404, "lightcurve_missing", f"The light curve file for '{sample_id}' is missing on disk.")
    time, flux = lc["time"], lc["flux"].astype(np.float64)
    period, t0, duration = float(row["koi_period"]), float(row["koi_time0bk"]), float(row["koi_duration"])

    processed, views, processing_error = None, None, None
    if mode == "normalized" or include_views:
        try:
            processed = process_light_curve(time, flux, period, t0, duration, quarter=lc["quarter"],
                                            cfg=state.predictor.preprocess_config if state.predictor else PreprocessConfig())
            if include_views:
                views = processed_to_dict(processed)
                views["signal"] = processed.stats
        except PreprocessingError as exc:
            processing_error = str(exc)
            if mode == "normalized":
                raise ApiError(422, "cannot_process", f"This light curve cannot be normalized: {exc}")

    if mode == "normalized":
        t_out, f_out = processed.time, processed.flux_normalized
        flux_unit = "relative flux (detrended, baseline 1.0)"
    else:
        t_out, f_out = time, flux
        flux_unit = "PDCSAP flux (electrons per second)"
    idx = _decimate(len(t_out), max_points)

    first = int(np.ceil((time[0] - t0) / period))
    last = int(np.floor((time[-1] - t0) / period))
    n_transits = max(last - first + 1, 0)
    shown = min(n_transits, 1500)
    transit_times = (t0 + (first + np.arange(shown)) * period).tolist()

    return {
        "sample": sample_to_dict(row),
        "lightcurve": {
            "mode": mode, "time": t_out[idx].tolist(), "flux": f_out[idx].tolist(),
            "n_total": int(len(t_out)), "n_returned": int(len(idx)), "decimated": bool(len(idx) < len(t_out)),
            "time_unit": "BKJD (BJD - 2454833), days", "flux_unit": flux_unit,
        },
        "transits": {
            "times": transit_times, "n_total": n_transits, "n_returned": shown,
            "duration_hours": duration, "period_days": period,
            "source": "Predicted from the Kaggle KOI catalog ephemeris (koi_period, koi_time0bk, koi_duration)",
        },
        "metadata": {
            "target_id": f"KIC {int(row['kepid'])}", "koi_name": row["kepoi_name"],
            "observation_count": int(len(time)), "duration_days": float(time[-1] - time[0]),
            "time_range": [float(time[0]), float(time[-1])],
            "flux_range": [float(flux.min()), float(flux.max())],
            "n_quarters": int(len(np.unique(lc["quarter"]))),
            "median_cadence_minutes": float(np.median(np.diff(time)) * 24 * 60),
            "dataset_label": _clean(row["koi_disposition"]), "split": row["split"],
        },
        "views": views,
        "processing_error": processing_error,
        "provenance": PROVENANCE,
    }
