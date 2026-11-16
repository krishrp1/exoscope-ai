"""Fetch genuine Kepler long-cadence light curves from MAST for Kaggle KOI targets.

Source: NASA Kepler mission light-curve files (``*_llc.fits``), served by the
Mikulski Archive for Space Telescopes (MAST) through its public S3 mirror
``stpubdata``. These are "Additional genuine astronomical observations": they
are not part of the Kaggle download, and nothing here is simulated.

For each selected Kepler target (kepid) every available quarter is downloaded,
the TIME / PDCSAP_FLUX / SAP_QUALITY columns are read, cadences with a
non-finite value or a non-zero quality flag are dropped, and the result is
stored as ``data/lightcurves/kic_<kepid>.npz``. FITS files are not kept.

Usage:
    python -m backend.ml.fetch_lightcurves --n-confirmed 1200 --n-false-positive 2464 --n-candidates 150
"""
from __future__ import annotations

import argparse
import io
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import requests
from astropy.io import fits

from . import config
from .dataset import lightcurve_path, load_koi_table, load_manifest

_KEY_RE = re.compile(r"<Key>([^<]+_llc\.fits)</Key>")
_local = threading.local()


def _session() -> requests.Session:
    if not hasattr(_local, "session"):
        _local.session = requests.Session()
    return _local.session


def _get(url: str, retries: int = 4, **kwargs) -> requests.Response:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            resp = _session().get(url, timeout=60, **kwargs)
            if resp.status_code == 200:
                return resp
            last = RuntimeError(f"HTTP {resp.status_code} for {url}")
        except requests.RequestException as exc:  # network hiccup: retry
            last = exc
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed after {retries} attempts: {last}")


def list_quarter_files(kepid: int) -> list[str]:
    """List the long-cadence FITS keys MAST holds for one Kepler target."""
    kic = f"{int(kepid):09d}"
    prefix = f"{config.MAST_S3_LC_PREFIX}/{kic[:4]}/{kic}/"
    resp = _get(f"{config.MAST_S3_BASE}/", params={"list-type": "2", "prefix": prefix})
    return sorted(set(_KEY_RE.findall(resp.text)))


def read_quarter(content: bytes) -> tuple[np.ndarray, np.ndarray, int]:
    """Parse one Kepler light-curve FITS file into good-quality (time, flux, quarter)."""
    with fits.open(io.BytesIO(content), memmap=False) as hdul:
        quarter = int(hdul[0].header.get("QUARTER", -1))
        data = hdul[1].data
        t = np.asarray(data["TIME"], dtype=np.float64)
        f = np.asarray(data["PDCSAP_FLUX"], dtype=np.float64)
        q = np.asarray(data["SAP_QUALITY"], dtype=np.int64)
    good = np.isfinite(t) & np.isfinite(f) & (q == 0)
    return t[good], f[good], quarter


def fetch_target(kepid: int) -> dict:
    """Download every quarter for one target and store it. Returns a manifest row."""
    row = {"kepid": int(kepid), "status": "error", "n_quarters": 0, "n_points": 0,
           "t_start": np.nan, "t_end": np.nan, "error": ""}
    try:
        keys = list_quarter_files(kepid)
        if not keys:
            row["status"] = "no_data"
            row["error"] = "no long-cadence files at MAST"
            return row
        times, fluxes, quarters = [], [], []
        for key in keys:
            t, f, quarter = read_quarter(_get(f"{config.MAST_S3_BASE}/{key}").content)
            if len(t) == 0:
                continue
            times.append(t)
            fluxes.append(f)
            quarters.append(np.full(len(t), quarter, dtype=np.int8))
        if not times:
            row["status"] = "no_data"
            row["error"] = "all cadences flagged or non-finite"
            return row
        t = np.concatenate(times)
        order = np.argsort(t, kind="stable")
        t = t[order]
        f = np.concatenate(fluxes)[order].astype(np.float32)
        q = np.concatenate(quarters)[order]
        path = lightcurve_path(kepid)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(path, time=t, flux=f, quarter=q)
        row.update(status="ok", n_quarters=len(times), n_points=int(len(t)),
                   t_start=float(t[0]), t_end=float(t[-1]))
    except Exception as exc:  # recorded in the manifest, not hidden
        row["error"] = f"{type(exc).__name__}: {exc}"[:300]
    return row


def select_targets(n_confirmed: int, n_false_positive: int, n_candidates: int,
                   seed: int = config.SEED) -> pd.DataFrame:
    """Seeded random sample of KOI rows per disposition.

    The defaults keep the catalog's FALSE POSITIVE : CONFIRMED ratio (about
    2.05 : 1) so that evaluation reflects the real class prevalence. Sampling
    is over KOI rows; a star that hosts several KOIs is downloaded once.
    """
    koi = load_koi_table()
    usable = koi[np.isfinite(koi["koi_period"]) & np.isfinite(koi["koi_time0bk"])
                 & np.isfinite(koi["koi_duration"]) & (koi["koi_period"] > 0) & (koi["koi_duration"] > 0)]
    parts = []
    for label, n in [(config.CLASS_NAMES[0], n_false_positive), (config.CLASS_NAMES[1], n_confirmed),
                     (config.UNLABELED_CLASS, n_candidates)]:
        pool = usable[usable[config.LABEL_COLUMN] == label]
        parts.append(pool.sample(n=min(n, len(pool)), random_state=seed))
    return pd.concat(parts).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--n-confirmed", type=int, default=1200)
    parser.add_argument("--n-false-positive", type=int, default=2464)
    parser.add_argument("--n-candidates", type=int, default=150)
    parser.add_argument("--workers", type=int, default=24)
    parser.add_argument("--retry-errors", action="store_true", help="re-attempt targets that errored before")
    args = parser.parse_args()

    selected = select_targets(args.n_confirmed, args.n_false_positive, args.n_candidates)
    kepids = sorted(set(selected["kepid"].astype(int)))
    manifest = load_manifest()
    done_status = {"ok", "no_data"} if args.retry_errors else {"ok", "no_data", "error"}
    done = set(manifest[manifest["status"].isin(done_status)]["kepid"].astype(int)) if not manifest.empty else set()
    todo = [k for k in kepids if k not in done or (k in done and not lightcurve_path(k).exists()
                                                    and manifest.set_index("kepid").loc[k, "status"] == "ok")]
    print(f"selected KOIs: {len(selected)}  unique targets: {len(kepids)}  to fetch: {len(todo)}", flush=True)

    rows = {int(r["kepid"]): r for r in manifest.to_dict("records")}
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    started = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch_target, k): k for k in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            row = fut.result()
            rows[row["kepid"]] = row
            if i % 25 == 0 or i == len(todo):
                pd.DataFrame(list(rows.values())).sort_values("kepid").to_csv(config.MANIFEST_PATH, index=False)
                elapsed = time.time() - started
                print(f"{i}/{len(todo)} targets  {elapsed:.0f}s elapsed  "
                      f"eta {elapsed / i * (len(todo) - i):.0f}s", flush=True)
    out = pd.DataFrame(list(rows.values())).sort_values("kepid")
    out.to_csv(config.MANIFEST_PATH, index=False)
    print(out["status"].value_counts().to_dict(), flush=True)


if __name__ == "__main__":
    main()
