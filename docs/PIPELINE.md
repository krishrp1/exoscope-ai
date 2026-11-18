# Data pipeline

Every signal passes through the same code path in training and inference (`backend/ml/preprocessing.py: process_light_curve`).

## Stage 1 — Catalog

Read from the Kaggle `arashnic/exoplanets` table: `koi_period`, `koi_time0bk`, `koi_duration`, `koi_disposition`, and the host-star identifiers. `CANDIDATE` rows are unresolved and are never used for training or evaluation.

## Stage 2 — Light curve

Load the star's Kepler long-cadence `PDCSAP_FLUX` from the FITS files fetched from MAST. Keep only cadences with `SAP_QUALITY == 0` and finite values.

## Stage 3 — Clean and segment

Drop missing values. Split the time series at data gaps and quarter boundaries into contiguous segments.

## Stage 4 — Detrend

Divide each segment by a moving median whose window is at least four transit durations, clamped to 1–6 days. In-transit cadences are a minority of every window, so the median follows the star, not the dip.

## Stage 5 — Clip and fold

Remove upward outliers only (downward excursions are the signal). Fold the cleaned series on the catalog period so every transit aligns at phase zero.

## Stage 6 — Bin

Median-bin into two 256-bin views: the whole orbit (global) and a zoom of ±4 transit durations (local). Scale each view to median 0, deepest bin −1.

## Stage 7 — Standardize

Apply a per-channel z-score whose mean and standard deviation are fitted on the training split only and saved with the model. The standardizer is the same object in training and inference.

## Stage 8 — Classify

Run the 1D CNN. The decision rule is the argmax of the softmax, equivalent to a 0.5 threshold; it was not tuned on the test set.

## Stage 9 — Explain

Saliency, Integrated Gradients and occlusion are computed for the predicted class. These are explanations of the model, not confirmed physical transit detections.

## Upload path

A CSV upload follows stages 2–9. If the user gives no period, mid-transit time and duration, the backend estimates them with an astropy Box Least Squares search and marks the ephemeris as estimated in the response. The BLS estimate can lock onto a harmonic of the true period, and the result is then less reliable.

## Leakage controls

- Split is by host star: no star appears in more than one split.
- The standardizer is fitted on train only.
- Augmentation (random time reversal, Gaussian noise) and class weights apply to training batches only.
- No vetting-derived catalog column (`koi_score`, `koi_fpflag_*`, `koi_pdisposition`) reaches the model.
- The decision threshold was not tuned on the test split.
- Unit tests assert each of these.