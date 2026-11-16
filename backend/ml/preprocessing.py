"""Reproducible light-curve preprocessing, shared by training and inference.

One code path (`process_light_curve`) turns a raw (time, flux) series plus a
transit ephemeris into the fixed-length model input:

  1. clean       drop non-finite cadences, sort by time
  2. segment     split at data gaps and Kepler quarter boundaries
  3. detrend     divide each segment by a moving-median trend (window >= 4x the
                 transit duration, so the transit itself survives)
  4. clip        remove upward outliers (> 5 robust sigma); dips are kept
  5. fold        phase-fold on the period, centred on mid-transit
  6. bin         median-bin into two fixed-length views:
                   global view  the whole orbit (phase -0.5 .. 0.5)
                   local view   a zoom of +-4 transit durations around mid-transit
  7. normalize   per view: median -> 0, deepest bin -> -1 (per sample, no fit)
  8. standardize z-score with per-channel mean/std fitted on the TRAINING split
                 only (`Standardizer`)

The ephemeris comes from the Kaggle KOI catalog for dataset samples. For an
uploaded light curve without one it is estimated with a Box Least Squares
search (`estimate_ephemeris`) and flagged as an estimate.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.ndimage import median_filter

from . import config

KEPLER_LONG_CADENCE_DAYS = 29.4244 / (60 * 24)  # used only when no time axis is given


class PreprocessingError(ValueError):
    """Raised when a light curve cannot be turned into a model input."""


@dataclass
class PreprocessConfig:
    n_bins: int = 256                    # length of each view (global and local)
    local_half_width_durations: float = 4.0
    gap_days: float = 0.75               # a gap larger than this starts a new segment
    detrend_window_durations: float = 4.0
    detrend_min_window_days: float = 1.0
    detrend_max_window_days: float = 6.0
    clip_sigma_upper: float = 5.0
    min_points: int = 200                # minimum good cadences for a usable curve
    min_segment_points: int = 10
    version: int = 1

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "PreprocessConfig":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class ProcessedCurve:
    """Everything produced for one signal; `views` is the (n_bins, 2) model input before standardization."""
    views: np.ndarray                    # shape (n_bins, 2): [:, 0] global, [:, 1] local
    global_phase: np.ndarray             # bin centres, orbital phase
    local_time_hours: np.ndarray         # bin centres, hours from mid-transit
    time: np.ndarray                     # cleaned time (after clipping)
    flux_normalized: np.ndarray          # detrended flux, baseline 1.0
    phase: np.ndarray                    # orbital phase per cadence
    period: float
    t0: float
    duration_hours: float
    stats: dict = field(default_factory=dict)


# ---------------------------------------------------------------- steps 1-4

def clean_series(time: np.ndarray | None, flux: np.ndarray,
                 quarter: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray | None, int]:
    """Step 1. Returns (time, flux, quarter, n_dropped). Missing values are dropped, never imputed."""
    flux = np.asarray(flux, dtype=np.float64).ravel()
    if time is None:
        time = np.arange(len(flux), dtype=np.float64) * KEPLER_LONG_CADENCE_DAYS
    time = np.asarray(time, dtype=np.float64).ravel()
    if len(time) != len(flux):
        raise PreprocessingError(f"time and flux have different lengths ({len(time)} vs {len(flux)})")
    good = np.isfinite(time) & np.isfinite(flux)
    n_dropped = int((~good).sum())
    time, flux = time[good], flux[good]
    if quarter is not None:
        quarter = np.asarray(quarter).ravel()[good]
    order = np.argsort(time, kind="stable")
    time, flux = time[order], flux[order]
    if quarter is not None:
        quarter = quarter[order]
    # exact duplicate timestamps: keep the first
    keep = np.concatenate(([True], np.diff(time) > 0))
    n_dropped += int((~keep).sum())
    time, flux = time[keep], flux[keep]
    if quarter is not None:
        quarter = quarter[keep]
    return time, flux, quarter, n_dropped


def segment_bounds(time: np.ndarray, quarter: np.ndarray | None, gap_days: float) -> list[tuple[int, int]]:
    """Step 2. Half-open index ranges of contiguous segments."""
    if len(time) == 0:
        return []
    breaks = np.diff(time) > gap_days
    if quarter is not None:
        breaks |= np.diff(quarter) != 0
    edges = np.concatenate(([0], np.nonzero(breaks)[0] + 1, [len(time)]))
    return [(int(a), int(b)) for a, b in zip(edges[:-1], edges[1:])]


def detrend(time: np.ndarray, flux: np.ndarray, quarter: np.ndarray | None,
            duration_days: float, cfg: PreprocessConfig) -> tuple[np.ndarray, np.ndarray, int]:
    """Step 3. Returns (flattened flux with baseline 1.0, keep mask, n_segments).

    Each segment is divided by its moving median. The window is several transit
    durations wide, so in-transit cadences are a minority of every window and
    the median tracks the stellar/instrumental trend, not the dip.
    """
    window_days = float(np.clip(cfg.detrend_window_durations * duration_days,
                                cfg.detrend_min_window_days, cfg.detrend_max_window_days))
    flat = np.full(len(flux), np.nan)
    bounds = segment_bounds(time, quarter, cfg.gap_days)
    for a, b in bounds:
        if b - a < cfg.min_segment_points:
            continue  # too short to estimate a trend: dropped
        seg_t, seg_f = time[a:b], flux[a:b]
        cadence = float(np.median(np.diff(seg_t)))
        size = int(round(window_days / cadence)) if cadence > 0 else 3
        size = max(3, min(size | 1, (b - a) | 1))  # odd, no longer than the segment
        trend = median_filter(seg_f, size=size, mode="nearest")
        with np.errstate(divide="ignore", invalid="ignore"):
            flat[a:b] = np.where(trend != 0, seg_f / trend, np.nan)
    keep = np.isfinite(flat)
    return flat, keep, len(bounds)


def clip_outliers(flux: np.ndarray, sigma_upper: float) -> np.ndarray:
    """Step 4. Mask of cadences to keep. Only upward outliers (cosmic rays, flares) are removed."""
    med = np.median(flux)
    mad = np.median(np.abs(flux - med))
    sigma = 1.4826 * mad
    if not np.isfinite(sigma) or sigma == 0:
        return np.ones(len(flux), dtype=bool)
    return flux <= med + sigma_upper * sigma


# ---------------------------------------------------------------- steps 5-7

def fold(time: np.ndarray, period: float, t0: float) -> np.ndarray:
    """Step 5. Orbital phase in [-0.5, 0.5) with mid-transit at 0."""
    return ((time - t0 + 0.5 * period) % period) / period - 0.5


def _median_bin(x: np.ndarray, y: np.ndarray, lo: float, hi: float, n_bins: int) -> tuple[np.ndarray, np.ndarray]:
    """Median of y in n_bins equal bins of x over [lo, hi). Returns (values with NaN for empty bins, counts)."""
    inside = (x >= lo) & (x < hi)
    idx = np.floor((x[inside] - lo) / (hi - lo) * n_bins).astype(np.int64)
    idx = np.clip(idx, 0, n_bins - 1)
    counts = np.bincount(idx, minlength=n_bins)
    values = np.full(n_bins, np.nan)
    if len(idx):
        grouped = pd.Series(y[inside]).groupby(idx).median()
        values[grouped.index.to_numpy()] = grouped.to_numpy()
    return values, counts


def _fill_empty(values: np.ndarray, periodic: bool) -> np.ndarray:
    """Linearly interpolate empty bins from their neighbours."""
    empty = ~np.isfinite(values)
    if not empty.any():
        return values
    if empty.all():
        raise PreprocessingError("no data falls inside the binned view")
    idx = np.arange(len(values))
    out = values.copy()
    out[empty] = np.interp(idx[empty], idx[~empty], values[~empty],
                           period=len(values) if periodic else None)
    return out


def normalize_view(view: np.ndarray) -> np.ndarray:
    """Step 7. Median to 0 and deepest bin to -1. A flat view stays at 0 (no division by ~0)."""
    centred = view - np.median(view)
    depth = -np.min(centred)
    if not np.isfinite(depth) or depth <= 0:
        return np.zeros_like(centred)
    return centred / depth


def make_views(phase: np.ndarray, flux: np.ndarray, period: float, duration_days: float,
               cfg: PreprocessConfig) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    """Step 6 + 7. Returns (views (n_bins, 2), global bin centres, local bin centres in hours, stats)."""
    n = cfg.n_bins
    g_raw, g_counts = _median_bin(phase, flux, -0.5, 0.5, n)
    half = min(cfg.local_half_width_durations * duration_days, 0.5 * period)
    t_from_mid = phase * period
    l_raw, l_counts = _median_bin(t_from_mid, flux, -half, half, n)
    stats = {
        "global_empty_bins": int((g_counts == 0).sum()),
        "local_empty_bins": int((l_counts == 0).sum()),
        "local_half_width_hours": float(half * 24),
    }
    if stats["local_empty_bins"] == n:
        raise PreprocessingError("no observations near the predicted transit time")
    g = normalize_view(_fill_empty(g_raw, periodic=True))
    loc = normalize_view(_fill_empty(l_raw, periodic=False))
    g_centres = -0.5 + (np.arange(n) + 0.5) / n
    l_centres = (-half + (np.arange(n) + 0.5) * (2 * half / n)) * 24.0
    return np.stack([g, loc], axis=1).astype(np.float32), g_centres, l_centres, stats


# ---------------------------------------------------------------- full path

def process_light_curve(time: np.ndarray | None, flux: np.ndarray, period: float, t0: float,
                        duration_hours: float, quarter: np.ndarray | None = None,
                        cfg: PreprocessConfig | None = None) -> ProcessedCurve:
    """Steps 1-7 for one signal. Used identically by training and by inference."""
    cfg = cfg or PreprocessConfig()
    if not (np.isfinite(period) and period > 0):
        raise PreprocessingError("period must be a positive number of days")
    if not (np.isfinite(duration_hours) and duration_hours > 0):
        raise PreprocessingError("transit duration must be a positive number of hours")
    if not np.isfinite(t0):
        raise PreprocessingError("transit epoch (t0) must be a finite number")
    duration_days = duration_hours / 24.0

    n_input = int(np.asarray(flux).size)
    t, f, q, n_dropped = clean_series(time, flux, quarter)
    if len(t) < cfg.min_points:
        raise PreprocessingError(
            f"only {len(t)} valid observations after removing missing values; need at least {cfg.min_points}")

    flat, keep, n_segments = detrend(t, f, q, duration_days, cfg)
    t, flat = t[keep], flat[keep]
    if len(t) < cfg.min_points:
        raise PreprocessingError("too few observations left after detrending")
    not_outlier = clip_outliers(flat, cfg.clip_sigma_upper)
    n_clipped = int((~not_outlier).sum())
    t, flat = t[not_outlier], flat[not_outlier]

    phase = fold(t, period, t0)
    views, g_centres, l_centres, view_stats = make_views(phase, flat, period, duration_days, cfg)

    in_transit = np.abs(phase * period) <= 0.5 * duration_days
    out_flux = flat[~in_transit] if (~in_transit).any() else flat
    stats = {
        "n_input": n_input,
        "n_missing_dropped": n_dropped,
        "n_segments": n_segments,
        "n_outliers_clipped": n_clipped,
        "n_used": int(len(t)),
        "time_span_days": float(t[-1] - t[0]),
        "n_transits_observed": int(len(np.unique(np.round((t[in_transit] - t0) / period)))) if in_transit.any() else 0,
        "n_in_transit_points": int(in_transit.sum()),
        "measured_depth_ppm": float((1.0 - np.median(flat[in_transit])) * 1e6) if in_transit.any() else None,
        "out_of_transit_scatter_ppm": float(1.4826 * np.median(np.abs(out_flux - np.median(out_flux))) * 1e6),
        **view_stats,
    }
    return ProcessedCurve(views=views, global_phase=g_centres, local_time_hours=l_centres, time=t,
                          flux_normalized=flat, phase=phase, period=float(period), t0=float(t0),
                          duration_hours=float(duration_hours), stats=stats)


def estimate_ephemeris(time: np.ndarray | None, flux: np.ndarray,
                       cfg: PreprocessConfig | None = None) -> dict:
    """Estimate (period, t0, duration) with Box Least Squares for a curve that has no catalog ephemeris.

    This is an estimate of the strongest periodic box-shaped dip. It is not a
    vetted detection, and callers must label it as estimated.
    """
    from astropy.timeseries import BoxLeastSquares

    cfg = cfg or PreprocessConfig()
    t, f, _, _ = clean_series(time, flux)
    if len(t) < cfg.min_points:
        raise PreprocessingError(
            f"only {len(t)} valid observations after removing missing values; need at least {cfg.min_points}")
    flat, keep, _ = detrend(t, f, None, 0.5, cfg)  # generic 2-day window before any duration is known
    t, flat = t[keep], flat[keep]
    ok = clip_outliers(flat, cfg.clip_sigma_upper)
    t, flat = t[ok], flat[ok]
    span = float(t[-1] - t[0])
    if span <= 1.0:
        raise PreprocessingError("the light curve spans less than one day; cannot search for a period")
    # bin to ~1 hour to bound the cost of the search on multi-year curves
    if len(t) > 20000:
        width = max(span / 20000, 1.0 / 24)
        idx = np.floor((t - t[0]) / width).astype(np.int64)
        grouped = pd.DataFrame({"i": idx, "t": t, "f": flat}).groupby("i").median()
        t, flat = grouped["t"].to_numpy(), grouped["f"].to_numpy()
    durations = np.array([0.05, 0.1, 0.2, 0.33])
    max_period = min(span / 2.0, 200.0)
    min_period = max(0.5, 2.5 * durations.max())
    if max_period <= min_period:
        raise PreprocessingError("the light curve is too short to search for a repeating transit")
    periods = np.exp(np.linspace(np.log(min_period), np.log(max_period), 6000))
    scatter = 1.4826 * float(np.median(np.abs(flat - np.median(flat))))
    bls = BoxLeastSquares(t, flat, dy=scatter if scatter > 0 else None)
    result = bls.power(periods, durations, objective="snr")
    best = int(np.argmax(result.power))
    return {
        "period": float(result.period[best]),
        "t0": float(result.transit_time[best]),
        "duration_hours": float(result.duration[best] * 24.0),
        "depth_ppm": float(result.depth[best] * 1e6),
        "bls_snr": float(result.depth_snr[best]),
        "method": "Box Least Squares (astropy.timeseries.BoxLeastSquares)",
    }


# ---------------------------------------------------------------- step 8

@dataclass
class Standardizer:
    """Per-channel z-score. `fit` must only ever see training-split samples."""
    mean: np.ndarray | None = None
    std: np.ndarray | None = None
    n_fit_samples: int = 0

    def fit(self, x_train: np.ndarray) -> "Standardizer":
        self.mean = x_train.mean(axis=(0, 1)).astype(np.float64)
        std = x_train.std(axis=(0, 1)).astype(np.float64)
        self.std = np.where(std > 0, std, 1.0)
        self.n_fit_samples = int(len(x_train))
        return self

    def transform(self, x: np.ndarray) -> np.ndarray:
        if self.mean is None or self.std is None:
            raise RuntimeError("Standardizer is not fitted")
        return ((x - self.mean) / self.std).astype(np.float32)

    def to_dict(self) -> dict:
        return {"mean": self.mean.tolist(), "std": self.std.tolist(), "n_fit_samples": self.n_fit_samples}

    @classmethod
    def from_dict(cls, d: dict) -> "Standardizer":
        return cls(mean=np.asarray(d["mean"], dtype=np.float64), std=np.asarray(d["std"], dtype=np.float64),
                   n_fit_samples=int(d.get("n_fit_samples", 0)))


# ---------------------------------------------------------------- dataset level

def prepare_koi_table(koi: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Table-level cleaning: duplicates, missing ephemerides, label encoding.

    Returns the labelled rows (CONFIRMED / FALSE POSITIVE only) with an integer
    `label` column, plus a report of what was removed. CANDIDATE rows are
    unresolved and are not given a label.
    """
    report = {"n_rows_in": int(len(koi))}
    df = koi.drop_duplicates(subset="kepoi_name", keep="first")
    report["n_duplicate_koi_dropped"] = int(len(koi) - len(df))
    eph = ["koi_period", "koi_time0bk", "koi_duration"]
    ok = np.isfinite(df[eph]).all(axis=1) & (df["koi_period"] > 0) & (df["koi_duration"] > 0)
    report["n_missing_ephemeris_dropped"] = int((~ok).sum())
    df = df[ok]
    labelled = df[df[config.LABEL_COLUMN].isin(config.CLASS_NAMES)].copy()
    report["n_unlabeled_candidate_excluded"] = int(len(df) - len(labelled))
    labelled["label"] = labelled[config.LABEL_COLUMN].map({n: i for i, n in enumerate(config.CLASS_NAMES)}).astype(int)
    report["n_rows_out"] = int(len(labelled))
    return labelled.reset_index(drop=True), report


def split_by_target(kepids: np.ndarray, val_fraction: float = 0.15, test_fraction: float = 0.15,
                    seed: int = config.SEED) -> np.ndarray:
    """Assign each sample to train/val/test by its host star, so no star spans two splits."""
    kepids = np.asarray(kepids)
    unique = np.unique(kepids)
    rng = np.random.default_rng(seed)
    shuffled = rng.permutation(unique)
    n_test = int(round(len(unique) * test_fraction))
    n_val = int(round(len(unique) * val_fraction))
    test_ids = set(shuffled[:n_test].tolist())
    val_ids = set(shuffled[n_test:n_test + n_val].tolist())
    return np.array(["test" if k in test_ids else "val" if k in val_ids else "train" for k in kepids.tolist()])


def build_dataset(cfg: PreprocessConfig | None = None, limit: int | None = None,
                  progress=None) -> dict:
    """Process every labelled KOI that has a fetched light curve into model inputs.

    Returns a dict with x (N, n_bins, 2), y, split, kepid, kepoi_name and a
    report. Samples that cannot be processed are listed in the report with the
    reason; they are not silently replaced.
    """
    from .dataset import load_koi_with_lightcurves, load_lightcurve

    cfg = cfg or PreprocessConfig()
    koi, table_report = prepare_koi_table(load_koi_with_lightcurves(include_candidates=True))
    if limit:
        koi = koi.sample(n=min(limit, len(koi)), random_state=config.SEED).reset_index(drop=True)
    xs, ys, kepids, names, failures = [], [], [], [], []
    cache: dict[int, dict] = {}
    for i, row in enumerate(koi.itertuples(index=False)):
        kepid = int(row.kepid)
        try:
            if kepid not in cache:
                cache = {kepid: load_lightcurve(kepid)}  # keep only the current star in memory
            lc = cache[kepid]
            pc = process_light_curve(lc["time"], lc["flux"], row.koi_period, row.koi_time0bk,
                                     row.koi_duration, quarter=lc["quarter"], cfg=cfg)
            xs.append(pc.views)
            ys.append(int(row.label))
            kepids.append(kepid)
            names.append(row.kepoi_name)
        except (PreprocessingError, FileNotFoundError) as exc:
            failures.append({"kepoi_name": row.kepoi_name, "reason": str(exc)})
        if progress and (i + 1) % 100 == 0:
            progress(i + 1, len(koi))
    if not xs:
        raise RuntimeError("no samples could be processed; fetch light curves first")
    kepids_arr = np.asarray(kepids, dtype=np.int64)
    return {
        "x": np.stack(xs).astype(np.float32),
        "y": np.asarray(ys, dtype=np.int64),
        "kepid": kepids_arr,
        "kepoi_name": np.asarray(names),
        "split": split_by_target(kepids_arr),
        "report": {**table_report, "n_processed": len(xs), "n_failed": len(failures), "failures": failures},
    }


def save_processed(data: dict, cfg: PreprocessConfig, path: Path | None = None) -> Path:
    path = path or config.PROCESSED_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, x=data["x"], y=data["y"], kepid=data["kepid"], kepoi_name=data["kepoi_name"],
                        split=data["split"], report=json.dumps(data["report"]), config=json.dumps(cfg.to_dict()))
    return path


def load_processed(path: Path | None = None) -> tuple[dict, PreprocessConfig]:
    path = path or config.PROCESSED_PATH
    with np.load(path, allow_pickle=False) as z:
        data = {k: z[k] for k in ("x", "y", "kepid", "kepoi_name", "split")}
        data["report"] = json.loads(str(z["report"]))
        cfg = PreprocessConfig.from_dict(json.loads(str(z["config"])))
    return data, cfg


if __name__ == "__main__":
    import time as _time

    started = _time.time()
    cfg_ = PreprocessConfig()
    data_ = build_dataset(cfg_, progress=lambda i, n: print(f"{i}/{n}", flush=True))
    out = save_processed(data_, cfg_)
    rep = {k: v for k, v in data_["report"].items() if k != "failures"}
    print(f"saved {out} in {_time.time() - started:.0f}s", rep)
    for name in ("train", "val", "test"):
        m = data_["split"] == name
        print(name, int(m.sum()), "positives", int(data_["y"][m].sum()))
