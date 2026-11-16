"""Compute every statistic quoted in docs/DATASET_REPORT.md and write docs/dataset_stats.json.

Run:  python -m backend.scripts.dataset_audit
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from backend.ml import config
from backend.ml.dataset import kaggle_csv_path, load_koi_table, load_lightcurve, load_manifest
from backend.ml.fetch_lightcurves import select_targets


def audit() -> dict:
    path = kaggle_csv_path()
    koi = load_koi_table()
    files = [{"name": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
             for p in sorted(path.parent.rglob("*")) if p.is_file()]
    numeric = koi.select_dtypes("number")
    missing = koi.isna().sum()
    eph_ok = (np.isfinite(koi[["koi_period", "koi_time0bk", "koi_duration"]]).all(axis=1)
              & (koi["koi_period"] > 0) & (koi["koi_duration"] > 0))
    disp = koi[config.LABEL_COLUMN].value_counts()
    koi_per_star = koi.groupby("kepid").size()
    mixed = koi[koi[config.LABEL_COLUMN].isin(config.CLASS_NAMES)].groupby("kepid")[config.LABEL_COLUMN].nunique()

    stats: dict = {
        "kaggle": {
            "dataset": config.KAGGLE_DATASET,
            "files": files,
            "n_rows": int(len(koi)),
            "n_columns": int(koi.shape[1]),
            "columns": {c: str(t) for c, t in koi.dtypes.items()},
            "n_exact_duplicate_rows": int(koi.duplicated().sum()),
            "n_duplicate_kepoi_name": int(koi["kepoi_name"].duplicated().sum()),
            "n_unique_kepid": int(koi["kepid"].nunique()),
            "n_stars_with_multiple_koi": int((koi_per_star > 1).sum()),
            "max_koi_per_star": int(koi_per_star.max()),
            "n_stars_with_both_confirmed_and_false_positive": int((mixed > 1).sum()),
            "missing_values": {c: int(n) for c, n in missing.items() if n > 0},
            "n_columns_entirely_missing": int((missing == len(koi)).sum()),
            "koi_disposition_counts": {k: int(v) for k, v in disp.items()},
            "koi_pdisposition_counts": {k: int(v) for k, v in koi["koi_pdisposition"].value_counts().items()},
            "disposition_crosstab": {a: {b: int(v) for b, v in row.items()} for a, row in
                                     pd.crosstab(koi["koi_disposition"], koi["koi_pdisposition"]).to_dict("index").items()},
            "false_positive_flag_sums": {c: int(koi[c].sum()) for c in koi.columns if c.startswith("koi_fpflag")},
            "koi_fpflag_value_counts": {c: {str(k): int(v) for k, v in koi[c].value_counts().items()}
                                        for c in koi.columns if c.startswith("koi_fpflag")},
            "n_usable_ephemeris": int(eph_ok.sum()),
            "numeric_ranges": {c: {"min": float(numeric[c].min()), "median": float(numeric[c].median()),
                                   "max": float(numeric[c].max())}
                               for c in ("koi_period", "koi_time0bk", "koi_duration", "koi_depth", "koi_prad",
                                         "koi_model_snr", "koi_kepmag", "koi_score", "ra", "dec")},
            "has_flux_time_series_columns": bool(any("flux" in c.lower() for c in koi.columns)),
            "labelled_imbalance_ratio_fp_to_confirmed": float(disp["FALSE POSITIVE"] / disp["CONFIRMED"]),
            "labelled_positive_fraction": float(disp["CONFIRMED"] / (disp["CONFIRMED"] + disp["FALSE POSITIVE"])),
        }
    }

    manifest = load_manifest()
    if not manifest.empty:
        ok = manifest[manifest["status"] == "ok"]
        have = set(ok["kepid"].astype(int))
        sel = koi[koi["kepid"].isin(have) & eph_ok]
        cadences, sample_ids = [], ok["kepid"].astype(int).sort_values().iloc[::max(len(ok) // 50, 1)]
        for kepid in sample_ids:
            lc = load_lightcurve(int(kepid))
            cadences.append(float(np.median(np.diff(lc["time"]))) * 24 * 60)
        stats["lightcurves"] = {
            "source": "NASA Kepler long-cadence light curves (PDCSAP_FLUX) from MAST, public S3 mirror stpubdata",
            "provenance": config.PROVENANCE_MAST,
            "fetch_status_counts": {k: int(v) for k, v in manifest["status"].value_counts().items()},
            "n_targets_ok": int(len(ok)),
            "n_points_median": float(ok["n_points"].median()),
            "n_points_min": int(ok["n_points"].min()),
            "n_points_max": int(ok["n_points"].max()),
            "n_quarters_median": float(ok["n_quarters"].median()),
            "n_quarters_min": int(ok["n_quarters"].min()),
            "time_span_days_median": float((ok["t_end"] - ok["t_start"]).median()),
            "t_start_min_bkjd": float(ok["t_start"].min()),
            "t_end_max_bkjd": float(ok["t_end"].max()),
            "median_cadence_minutes_over_sampled_targets": float(np.median(cadences)),
            "n_targets_sampled_for_cadence": int(len(cadences)),
            "koi_with_lightcurve_by_disposition": {k: int(v) for k, v in sel[config.LABEL_COLUMN].value_counts().items()},
            "n_koi_with_lightcurve": int(len(sel)),
            "errors": manifest[manifest["status"] != "ok"][["kepid", "status", "error"]].to_dict("records")[:20],
        }
        requested = select_targets(1200, 2464, 150)
        stats["lightcurves"]["requested_sample"] = {
            "seed": config.SEED,
            "koi_by_disposition": {k: int(v) for k, v in requested[config.LABEL_COLUMN].value_counts().items()},
            "n_unique_targets": int(requested["kepid"].nunique()),
            "n_requested_targets_fetched": int(requested["kepid"].isin(have).sum() and
                                               requested[requested["kepid"].isin(have)]["kepid"].nunique()),
        }
    return stats


if __name__ == "__main__":
    out = config.REPO_ROOT / "docs" / "dataset_stats.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    result = audit()
    out.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
