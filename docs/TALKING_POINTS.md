# Interview talking points

Design decisions, trade-offs, and what I would do next. Use this as a crib sheet; every number below is read from `backend/artifacts/metrics.json`.

## 1. Why this dataset, and why not tabular?

The mandated Kaggle catalog is a table of fitted parameters — no light curves. The honest options were: train a tabular classifier (not a time-series model, and several columns are outputs of earlier vetting, so they leak the label), synthesize light curves (fabricated data), or fetch real light curves. I fetched genuine Kepler PDCSAP flux from MAST for a seeded sample of the catalog's stars, keeping the Kaggle table as the source of targets, labels and ephemerides. That is the only option that gives a real time-series problem.

## 2. Why phase-folded views instead of the raw series?

A four-year long-cadence record is about 65,000 points, and a three-hour transit in a 40-day orbit is under 2 of 256 bins. Folding on the catalog period and binning into a global view plus a ±4-duration zoom is the established representation for this problem (Shallue & Vanderburg 2018). The cost: the model depends on a correct ephemeris, and I never measured performance with estimated (BLS) ephemerides.

## 3. Why is the positive share 40% when the catalog is 33%?

A star's light curve contains all of its KOIs, so every KOI on a fetched star is used — 4,136 labelled signals from 3,546 stars. Confirmed planets cluster in multi-planet systems, which lifts the positive share. I kept the larger set over a strict catalog-ratio sample (472 fewer signals) and documented the bias. Test-set precision would be lower at the catalog's real prevalence.

## 4. Why not tune the decision threshold?

Tuning on the test set is leakage. Tuning on validation is possible future work; the ROC and PR curves are published so the trade-off is visible. The threshold stays at argmax.

## 5. What is the model actually good at, and where does it fail?

On the held-out test set (626 signals, 512 stars, 252 confirmed): recall 0.877, precision 0.884, PR-AUC 0.940. It misses 31 of 252 confirmed planets and calls 29 false positives planets. The confusion matrix is `[[345, 29], [31, 221]]` (rows true, columns predicted). The validation loss is noisy from epoch to epoch, so the chosen checkpoint depends on that noise. One training run, one seed, no hyperparameter search.

## 6. What would I do next?

- Measure performance with BLS-estimated ephemerides, since real uploads will not have a catalog period.
- Try a threshold sweep on validation and report precision/recall at catalog prevalence.
- Address the 16 samples (0.4%) that the detrending step flattens to all zeros.
- Run a small hyperparameter search (dropout, learning rate, window size).
- Fetch more of the 43% of labelled KOIs that were not downloaded.
- Add confidence intervals by retraining with different seeds.

## 7. Honest limitations to expect questions on

- The model scores signals that are already known; it does not search for new planets and has not discovered any.
- Saliency, Integrated Gradients and occlusion are explanations of the model, not confirmed physical transits.
- The landing-page transit animation is synthetic illustration data, badged as such.
- The standardizer's standard deviation is computed in float32 and differs from the float64 value by about 0.1%; it is applied identically in training and inference.
- Recent predictions are kept in memory only and reset on restart.
- A completed training run started from the API replaces the served model, including short runs.
- The BLS estimate for uploads without an ephemeris can land on a harmonic of the true period.