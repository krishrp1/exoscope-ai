# Phase 1 verification: data auditor

Independent, read-only sub-agent. It re-derived every statistic with its own pandas/numpy code from the raw Kaggle CSV, the 3,546 light-curve files and `data/processed_views.npz`, and downloaded FITS files from MAST itself.

## Round 1

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every numeric claim in `docs/DATASET_REPORT.md` is true | **FAIL** | All figures matched (file size, SHA-256, shape, dtypes, unique counts, duplicates, missing values, label counts, crosstab, ranges, imbalance, light-curve counts, cadence, split table). Two prose statements were false (below). |
| 2 | Kaggle file contains no flux time series | PASS | One data file, 49 scalar per-KOI columns; the only time-like columns are the transit epoch and its errors. |
| 3 | Task, classes and source decided, logged, consistent | PASS | D1 to D5 match `config.py`, the fetcher and the data on disk; processed labels equal `koi_disposition == CONFIRMED` for all 4,136 rows; no CANDIDATE rows. |
| 4 | Light curves are genuine | PASS | 5 stars (KIC 5449777 all 17 quarters; 5471606, 9718379, 7455287, 4454219 one quarter each) compared against FITS downloaded from `stpubdata`: cadence counts, TIME and PDCSAP_FLUX bit-exact. Headers: `TELESCOP=Kepler`, `OBSMODE=long cadence`, `ORIGIN=NASA/Ames`. |
| 5 | Sampling reproducible and on disk | PASS | Own re-implementation and `select_targets(1200, 2464, 150)` both give 3,814 rows on 3,546 stars, identical to the files and the manifest. |

Integrity violations: none found.

### Issues found and fixes

| # | Issue | Fix |
|---|---|---|
| 1 | Report said the maximum period and radius are both on false positives. The maximum period (K01174.01) is a CANDIDATE. | Sentence corrected, naming both KOIs and their dispositions. |
| 2 | Report said only confirmed planets have a `kepler_name`. 2 FALSE POSITIVE rows also have one. | Sentence corrected: 2,357 CONFIRMED and 2 FALSE POSITIVE. |
| 3 | D5 estimated 120 GB for all stars; measured file sizes give about 60 GB. | Corrected to 8,214 stars at about 7.5 MB, roughly 60 GB. |
| 4 | D2 quoted a per-target time not supported by the logs. | Replaced with the logged figures (0.33 to 0.41 s per target, `--workers 40`). |
| 5 | D5 did not mention the two-stage fetch. | Added to D5 and to the report. |
| 6 | Report omitted the maximum quarters per star (18). | Added. |
| 7 | Split table was not in `docs/dataset_stats.json`. | `dataset_audit.py` now writes a `splits` block, including a cross-split star count (0). |

## Round 2

See the end of this file.

**Criterion 1: PASS.** The auditor re-derived each corrected statement from the raw data: the maximum period is on K01174.01 (CANDIDATE) and the maximum radius on K06604.01 (FALSE POSITIVE); 2,359 named rows are 2,357 CONFIRMED and 2 FALSE POSITIVE; quarters maximum is 18 (647 stars); the two-stage fetch reproduces the logged 2,550 rows on 2,316 stars and the 1,230 added stars; D2 timings match the logs (0.332 and 0.409 s per star); 8,214 stars at 7.5 MB is about 61.6 GB; the `splits` block equals `data/processed_views.npz` with 0 stars in more than one split. A full re-scan of the report found no other false statement.

Remaining note: the `--workers 40` figure in D2 was not recorded in the fetch logs. The fetcher now prints its worker count, and D2 says the figure comes from the command used.
