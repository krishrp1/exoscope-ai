"""Dataset access: the Kaggle KOI catalog and the fetched Kepler light curves.

The Kaggle dataset (arashnic/exoplanets) is a *tabular* catalog of Kepler
Objects of Interest. It contains no flux time series. Light curves are genuine
Kepler observations fetched separately from MAST (see fetch_lightcurves.py)
for the targets listed in the Kaggle table.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from . import config


@lru_cache(maxsize=1)
def kaggle_csv_path() -> Path:
    """Bundled catalog if present (deployments), else download/reuse the Kaggle copy."""
    bundled = config.DATA_DIR / config.KAGGLE_FILENAME
    if bundled.exists():
        return bundled
    import kagglehub

    root = Path(kagglehub.dataset_download(config.KAGGLE_DATASET))
    path = root / config.KAGGLE_FILENAME
    if not path.exists():
        candidates = sorted(root.rglob("*.csv"))
        if not candidates:
            raise FileNotFoundError(f"No CSV found in Kaggle dataset at {root}")
        path = candidates[0]
    return path


@lru_cache(maxsize=1)
def _load_koi_table_cached() -> pd.DataFrame:
    return pd.read_csv(kaggle_csv_path())


def load_koi_table() -> pd.DataFrame:
    """Return the Kaggle KOI catalog, unmodified (a copy, safe to mutate)."""
    return _load_koi_table_cached().copy()


def lightcurve_path(kepid: int) -> Path:
    return config.LIGHTCURVE_DIR / f"kic_{int(kepid):09d}.npz"


def load_lightcurve(kepid: int) -> dict[str, np.ndarray]:
    """Load one fetched Kepler light curve.

    Returns arrays: time (BKJD days = BJD - 2454833), flux (PDCSAP, e-/s),
    quarter (Kepler quarter index per cadence). Only cadences with a finite
    flux and SAP_QUALITY == 0 were stored.
    """
    path = lightcurve_path(kepid)
    if not path.exists():
        raise FileNotFoundError(f"No fetched light curve for KIC {kepid} at {path}")
    with np.load(path) as z:
        return {"time": z["time"], "flux": z["flux"], "quarter": z["quarter"]}


def load_manifest() -> pd.DataFrame:
    """Manifest of fetch attempts: one row per Kepler target (kepid)."""
    if not config.MANIFEST_PATH.exists():
        return pd.DataFrame(columns=["kepid", "status", "n_quarters", "n_points", "t_start", "t_end", "error"])
    return pd.read_csv(config.MANIFEST_PATH)


def available_kepids() -> set[int]:
    """Targets with a successfully fetched light curve on disk."""
    manifest = load_manifest()
    if manifest.empty:
        return set()
    ok = manifest[manifest["status"] == "ok"]["kepid"].astype(int)
    return {k for k in ok if lightcurve_path(k).exists()}


def load_koi_with_lightcurves(include_candidates: bool = True) -> pd.DataFrame:
    """KOI rows whose host star has a fetched light curve and a usable ephemeris."""
    koi = load_koi_table()
    have = available_kepids()
    df = koi[koi["kepid"].isin(have)].copy()
    df = df[np.isfinite(df["koi_period"]) & np.isfinite(df["koi_time0bk"]) & np.isfinite(df["koi_duration"])]
    df = df[(df["koi_period"] > 0) & (df["koi_duration"] > 0)]
    if not include_candidates:
        df = df[df[config.LABEL_COLUMN].isin(config.CLASS_NAMES)]
    return df.reset_index(drop=True)
