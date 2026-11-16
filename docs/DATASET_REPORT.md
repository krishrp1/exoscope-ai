# Dataset Report

Every number here was produced by code in this repository. To regenerate them: `backend/.venv/bin/python -m backend.scripts.dataset_audit` (writes `docs/dataset_stats.json`) and `backend/.venv/bin/python -m backend.ml.preprocessing` (prints split counts).

## 1. What the Kaggle download contains

`kagglehub.dataset_download("arashnic/exoplanets")` returns one file.

| File | Size | SHA-256 |
|---|---|---|
| `exoplanets.csv` | 3,132,961 bytes | `6d8487f3a935e73cdf399f4d13266606cbbc13382c46e00857317f6d390d57f6` |

It is the Kepler Objects of Interest (KOI) cumulative table from the NASA Exoplanet Archive: one row per candidate transit signal, with parameters fitted by the Kepler pipeline.

- Shape: 9,564 rows, 49 columns.
- Unique KOIs (`kepoi_name`): 9,564. Unique host stars (`kepid`): 8,214.
- 938 stars host more than one KOI; the most on one star is 7.
- Exact duplicate rows: 0. Duplicate `kepoi_name`: 0.
- Column types: 5 integer (`kepid` and four `koi_fpflag_*`), 5 text (`kepoi_name`, `kepler_name`, `koi_disposition`, `koi_pdisposition`, `koi_tce_delivname`), 39 float.

### Does it contain light curves?

**No.** No column holds flux, and there is no time axis. The table holds summary parameters of each signal (period, epoch, duration, depth, planet radius, stellar properties). Sampling cadence does not apply to the Kaggle file.

### Columns (grouped)

| Group | Columns |
|---|---|
| Identity | `kepid`, `kepoi_name`, `kepler_name` |
| Labels | `koi_disposition`, `koi_pdisposition`, `koi_score` |
| Vetting flags | `koi_fpflag_nt`, `koi_fpflag_ss`, `koi_fpflag_co`, `koi_fpflag_ec` |
| Transit fit (each with `_err1`, `_err2`) | `koi_period`, `koi_time0bk`, `koi_impact`, `koi_duration`, `koi_depth`, `koi_prad`, `koi_teq`, `koi_insol` |
| Fit quality | `koi_model_snr`, `koi_tce_plnt_num`, `koi_tce_delivname` |
| Star (each with `_err1`, `_err2`) | `koi_steff`, `koi_slogg`, `koi_srad` |
| Position, brightness | `ra`, `dec`, `koi_kepmag` |

### Value ranges

| Column | Min | Median | Max |
|---|---|---|---|
| `koi_period` (days) | 0.2418 | 9.753 | 129,995.8 |
| `koi_time0bk` (BKJD) | 120.52 | 137.22 | 1,472.52 |
| `koi_duration` (hours) | 0.052 | 3.793 | 138.54 |
| `koi_depth` (ppm) | 0 | 421 | 1,540,000 |
| `koi_prad` (Earth radii) | 0.08 | 2.39 | 200,346 |
| `koi_model_snr` | 0 | 23.0 | 9,054.7 |
| `koi_kepmag` | 6.966 | 14.52 | 20.003 |
| `koi_score` | 0 | 0.334 | 1 |

Oddities: one row has `koi_fpflag_nt = 465` (the flag is otherwise 0 or 1). The maximum period (129,995 days) and radius (200,346 Earth radii) are unphysical fit results on false positives. They are left untouched in the catalog; the flag columns are not model inputs.

### Missing values

36 of 49 columns have missing values. `koi_teq_err1` and `koi_teq_err2` are empty in every row (9,564). `kepler_name` is missing in 7,205 rows (only confirmed planets have a name). `koi_score` is missing in 1,510. Most fitted parameters are missing in 321 to 483 rows; `koi_kepmag` in 1.

The three columns the pipeline needs (`koi_period`, `koi_time0bk`, `koi_duration`) are present and positive in all 9,564 rows.

## 2. Labels and the ML task

`koi_disposition` (Exoplanet Archive disposition):

| Value | Rows | Meaning |
|---|---|---|
| FALSE POSITIVE | 4,840 | The signal is not a planet (eclipsing binary, background star, instrumental, etc.) |
| CANDIDATE | 2,367 | Unresolved: not yet confirmed and not ruled out |
| CONFIRMED | 2,357 | A confirmed or validated planet |

`koi_pdisposition` is the Kepler pipeline's own automated disposition (CANDIDATE 4,717, FALSE POSITIVE 4,847). It agrees with `koi_disposition` except that 8 CONFIRMED rows are pipeline FALSE POSITIVE and 1 FALSE POSITIVE row is pipeline CANDIDATE.

**Task:** binary classification of a transit-like signal as CONFIRMED (positive) or FALSE POSITIVE (negative), using `koi_disposition` as given. CANDIDATE rows are excluded from training and evaluation because they have no resolved label. See `DECISIONS.md` D4.

### Class imbalance

Among the 7,197 labelled rows the ratio is 4,840 : 2,357 = 2.05 : 1, so 32.7% are positive. This is moderate imbalance. 2,357 positives is enough to train a small CNN (44,642 parameters) without resampling tricks. Mitigations used: inverse-frequency class weights computed from the training split, and reporting precision, recall and PR-AUC for the positive class, not accuracy alone.

## 3. Light curves: additional genuine observations

Because the Kaggle file has no time series, light curves for its targets were fetched from NASA's archive (`backend/ml/fetch_lightcurves.py`).

- **Source:** Kepler mission long-cadence light-curve files (`*_llc.fits`), MAST, via the public S3 mirror `stpubdata/kepler/public/lightcurves/`.
- **Column used:** `PDCSAP_FLUX` (electrons per second), cadences with `SAP_QUALITY == 0` and finite values.
- **Time axis:** `TIME` in BKJD (BJD minus 2,454,833), the same system as `koi_time0bk`.
- **Cadence:** median 29.42 minutes (measured on 51 targets spread across the fetched set).

### Which targets

A seeded (42) random sample of KOI rows: 1,200 CONFIRMED, 2,464 FALSE POSITIVE (the catalog ratio) and 150 CANDIDATE. These 3,814 rows sit on 3,546 stars.

- Stars requested: 3,546. Fetched successfully: 3,546. Failed: 0.
- Observations per star: median 57,124, minimum 1,252, maximum 61,710.
- Quarters per star: median 17, minimum 1.
- Time span per star: median 1,459.5 days. Earliest cadence BKJD 120.54, latest 1,591.00.

### What is actually used

A star's light curve contains every KOI on that star, so all KOIs on the fetched stars are used, not only the sampled rows. That gives 4,523 KOIs with a light curve:

| Disposition | KOIs with a light curve | Used for |
|---|---|---|
| FALSE POSITIVE | 2,550 | training and evaluation |
| CONFIRMED | 1,586 | training and evaluation |
| CANDIDATE | 387 | display and inference only |

**Bias to know about:** including sibling KOIs raises the positive share from 32.7% (catalog) to 38.3% (1,586 of 4,136), because confirmed planets are concentrated in multi-planet systems. Test-set precision and PR-AUC are therefore measured at a somewhat higher prevalence than the full catalog. The 4,136 labelled signals are 57% of the catalog's 7,197.

### Processing outcome

All 4,136 labelled KOIs were processed into model inputs; 0 failed. Split by host star (no star in two splits):

| Split | Signals | Stars | FALSE POSITIVE | CONFIRMED |
|---|---|---|---|---|
| train | 2,902 | 2,389 | 1,790 | 1,112 |
| validation | 608 | 512 | 386 | 222 |
| test | 626 | 512 | 374 | 252 |

## 4. Provenance

| Data | Label | Source | Used for |
|---|---|---|---|
| KOI catalog (`exoplanets.csv`): targets, dispositions, ephemerides | **Original Kaggle data** | Kaggle `arashnic/exoplanets` (NASA Exoplanet Archive KOI table) | labels, transit ephemeris, sample metadata |
| Kepler PDCSAP light curves for 3,546 stars | **Additional genuine astronomical observations** | NASA Kepler mission via MAST (public S3 mirror) | model input for training, evaluation, inference |
| Test fixtures in `backend/tests/` | **Synthetic demonstration data** | generated by `make_synthetic_curve` | unit tests only; never in training or evaluation |
| Landing-page hero animation | **Synthetic demonstration data** | drawn in the frontend | illustration only, labelled as such |

## 5. Limits that follow from the data

- Labels are catalog dispositions, not ground truth. "CONFIRMED" includes statistically validated planets.
- The model sees a signal folded on the catalog's ephemeris. It classifies a known signal; it does not search a light curve for new ones.
- 43% of labelled KOIs were not fetched. Results describe this sample.
- The fold uses a fixed period, so planets with strong transit-timing variations are smeared.
