"""Build the small light-curve subset that is committed for free-tier deployment.

Full dataset (3,546 stars, 1.4 GB) stays local. Run from the repo root:
    backend/.venv/bin/python scripts/build_demo_subset.py [n_stars]
Writes data/demo/{lightcurves/*.npz, lightcurve_manifest.csv, exoplanets.csv}.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from backend.ml import config, dataset as ds
from backend.ml.preprocessing import load_processed

N = int(sys.argv[1]) if len(sys.argv) > 1 else 100
out = config.REPO_ROOT / "data" / "demo"
rng = np.random.default_rng(config.SEED)

data, _ = load_processed()
stars = pd.DataFrame({"kepid": data["kepid"], "split": data["split"], "y": data["y"]}).groupby("kepid").agg(
    split=("split", "first"), has_planet=("y", "max")).reset_index()
stars = stars[stars["kepid"].map(lambda k: ds.lightcurve_path(k).exists())]
# Mostly held-out stars (the honest ones to show), balanced between planet hosts and false-positive-only stars.
quota = {"test": 0.6, "val": 0.2, "train": 0.2}
picked = []
for split, frac in quota.items():
    for planet in (1, 0):
        pool = stars[(stars["split"] == split) & (stars["has_planet"] == planet)]["kepid"].to_numpy()
        picked += rng.choice(pool, min(len(pool), round(N * frac / 2)), replace=False).tolist()
picked = sorted(set(int(k) for k in picked))

(out / "lightcurves").mkdir(parents=True, exist_ok=True)
for k in picked:
    shutil.copy(ds.lightcurve_path(k), out / "lightcurves" / ds.lightcurve_path(k).name)
man = ds.load_manifest()
man[man["kepid"].isin(picked)].to_csv(out / "lightcurve_manifest.csv", index=False)
shutil.copy(ds.kaggle_csv_path(), out / "exoplanets.csv")
mb = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1e6
print(f"{len(picked)} stars, {mb:.1f} MB in {out}")
