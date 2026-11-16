# Decisions

Decisions taken without the owner present, with the alternatives considered and the reason. Newest phases at the bottom.

## Phase 1: Discovery and data

### D1. The Kaggle dataset is a catalog, so light curves are fetched from MAST
- **Finding.** `arashnic/exoplanets` is one file, `exoplanets.csv`: the Kepler Objects of Interest (KOI) cumulative table, 9,564 rows by 49 columns. It holds fitted transit parameters and dispositions. It holds no flux time series and no time axis.
- **Decision.** Keep the Kaggle table as the source of targets, labels and ephemerides. Fetch the genuine Kepler long-cadence light curves for those targets from NASA's MAST archive.
- **Alternatives.** (a) Train a tabular classifier on the KOI columns: honest, but it is not a 1D CNN on light curves and several columns (`koi_score`, `koi_fpflag_*`) are outputs of earlier vetting, so they leak the label. (b) Synthesize light curves from the fitted parameters: forbidden, it would be fabricated data. (c) Reshape tabular columns into a fake sequence: forbidden and meaningless.
- **Why.** It is the only option that gives a real time-series problem while keeping the mandated dataset as the starting point.

### D2. Direct download from the MAST public S3 mirror, not `lightkurve`
- **Decision.** `backend/ml/fetch_lightcurves.py` lists and downloads `*_llc.fits` files from `https://stpubdata.s3.amazonaws.com/kepler/public/lightcurves/` and reads them with `astropy`.
- **Alternatives.** `lightkurve.search_lightcurve(...).download_all()`: same files, but one search round-trip per target and serial downloads.
- **Why.** Same data, no credentials, and a measured 0.33 to 0.41 s per target with `--workers 40` (770 s for 2,316 stars, 503 s for 1,230; see `data/fetch.log`, `data/fetch2.log`; those two logs predate the fetcher printing its worker count, so the 40 is from the command used, not from the log). The files are the official mission products; only the transport differs.

### D3. PDCSAP flux, quality flag 0 only
- **Decision.** Use `PDCSAP_FLUX` (systematics-corrected by the Kepler pipeline) and keep cadences with `SAP_QUALITY == 0` and finite values.
- **Alternatives.** `SAP_FLUX` (raw aperture photometry) needs its own systematics correction.
- **Why.** PDCSAP is the standard input for transit work, including Shallue & Vanderburg (2018).

### D4. The task is binary: CONFIRMED vs FALSE POSITIVE, CANDIDATE excluded
- **Decision.** Labels are the Kaggle column `koi_disposition`, used as given. `CONFIRMED` is the positive class, `FALSE POSITIVE` the negative class. `CANDIDATE` rows have no resolved label, so they are never used for training or evaluation. A sample of them is fetched so the app can show model output on unresolved objects.
- **Alternatives.** (a) Three classes with CANDIDATE as a class: it is "not yet decided", not a physical category, so the class would be label noise. (b) `koi_pdisposition` (CANDIDATE vs FALSE POSITIVE): it is the Kepler pipeline's own automated vetting output, so the model would learn to imitate that pipeline. (c) Merging CANDIDATE into CONFIRMED: relabels data.
- **Why.** It uses the dataset's real labels and does not relabel anything.

### D5. A seeded random sample that keeps the catalog class ratio
- **Decision.** Fetch light curves for 1,200 CONFIRMED and 2,464 FALSE POSITIVE KOIs (the catalog's 2.05 : 1 ratio) plus 150 CANDIDATE KOIs, sampled with seed 42 from rows that have a usable ephemeris. The first fetch used a class-balanced 1,200 + 1,200; it was extended to 2,464 FALSE POSITIVE rows once the prevalence problem in alternative (b) was recognized. The seeded sample is prefix-consistent, so the final set equals one run with the final counts.
- **Alternatives.** (a) All 9,564 KOIs: 8,214 stars at about 7.5 MB each, roughly 60 GB of FITS traffic; too slow for one unattended run. (b) A class-balanced sample: it would make test-set precision and PR-AUC look better than they are at the real prevalence.
- **Why.** Evaluation should reflect the prevalence in the catalog. Imbalance is handled in training with class weights instead of by changing the test distribution.
- **Follow-up.** A star's light curve contains all of its KOIs, so every KOI on a fetched star is used (4,136 labelled signals: 1,586 CONFIRMED, 2,550 FALSE POSITIVE). This adds data at no download cost but lifts the positive share to 38.3% against 32.7% in the catalog, because confirmed planets cluster in multi-planet systems. Alternative considered: use only the sampled rows (exact catalog ratio, 472 fewer signals). Kept the larger set and documented the bias in `docs/DATASET_REPORT.md`.

### D6. Model input is a phase-folded pair of views, built from the catalog ephemeris
- **Decision.** Each KOI's light curve is detrended, folded on the Kaggle `koi_period` / `koi_time0bk`, and median-binned into a 256-bin global view (whole orbit) and a 256-bin local view (plus or minus 4 transit durations). The two views are the two channels of the CNN input.
- **Alternatives.** (a) Feed the raw 4-year series (about 65,000 points): transits last a few hours in a multi-year record, there are several KOIs per star, and a small CPU model cannot learn from that. (b) A single global view: a 3-hour transit in a 40-day orbit is under 2 of 256 bins, so shape information is lost.
- **Why.** This is the established representation for this exact problem (Shallue & Vanderburg 2018). A star with several KOIs yields several distinct folded signals from one light curve.
- **Consequence.** The ephemeris is an input. For uploaded curves without one, a Box Least Squares search estimates it and the UI says it is an estimate.

### D7. No synthetic data in training or evaluation
- **Decision.** Synthetic light curves exist only as unit-test fixtures and, where the UI needs an illustration (the landing-page animation), as clearly badged "Synthetic demonstration data".

### D8. Python 3.12 virtualenv
- **Finding.** The machine had only Python 3.14. TensorFlow has no stable wheel for 3.14 (only `2.22.0rc0`).
- **Decision.** Installed Homebrew `python@3.12` side by side (it does not change the default `python3`) and built `backend/.venv` on it with stable TensorFlow 2.21.
- **Alternatives.** Use the TensorFlow release candidate on 3.14.
- **Why.** A portfolio project should install from stable releases. Undo with `brew uninstall python@3.12`.

### D9. Git identity
- **Finding.** No global git identity was configured on this machine.
- **Decision.** Set a repo-local identity only (`git config user.name` / `user.email` inside this repo): the macOS account's full name and the email of the Claude account that ran the session. No `Co-Authored-By` or tool attribution lines are added.
- **To change it.** `git config user.name "..."; git config user.email "..."; git rebase -r --root --exec "git commit --amend --no-edit --reset-author"`.

## Phase 2: ML pipeline

### D10. Detrending with a moving median, window at least 4 transit durations
- **Decision.** Each contiguous segment is divided by a moving median whose window is 4 transit durations, clamped to 1 to 6 days.
- **Alternatives.** A spline fitted with in-transit points masked (Shallue & Vanderburg): slightly better depth preservation, more code and tuning.
- **Why.** In-transit cadences are a minority of every window, so the median follows the star, not the dip. Simple and deterministic. Cost: transits longer than about 1.5 days are partly flattened (the window is capped at 6 days). Second cost, found by the Phase 2 reviewer: on stars with smooth, high-amplitude variability the median filter removes the signal entirely and the view becomes all zeros. This affects 16 of 4,136 samples (15 FALSE POSITIVE, 1 CONFIRMED; 11 in train, 5 in validation, 0 in test). They are kept as they are; the pipeline was not changed after seeing test results.

### D11. Only upward outliers are clipped
- **Why.** Downward excursions are the signal. Clipping them would erase deep eclipses.

### D12. Two normalizations
- **Decision.** Per sample: each view is shifted to median 0 and scaled so its deepest bin is -1. Then a per-channel z-score whose mean and standard deviation are fitted on the training split only and saved with the model.
- **Cost.** Scaling every view to depth -1 removes absolute depth, which is a useful discriminator for eclipsing binaries. Kept because it makes the input independent of flux units, which uploads need.

### D13. Imbalance: class weights, plus training-only augmentation
- **Decision.** Inverse-frequency class weights from the training labels. Augmentation (random time reversal of the folded views, Gaussian noise of 0.05) is applied to training batches only.
- **Alternatives.** Oversampling the positive class: equivalent in expectation to class weights, and it duplicates samples.

### D14. Decision threshold stays at argmax (0.5)
- **Why.** Tuning the threshold on the test set would be leakage. Tuning on validation is possible future work; the ROC and PR curves are published so the trade-off is visible.

### D15. A stopped training run does not replace the saved model
- **Why.** A run stopped after one epoch must not overwrite a good model. Only completed runs are promoted; promotion copies the model file first, then its configs.

### D16. Hyperparameters were not searched
- **Decision.** One configuration (Adam 1e-3, batch 64, dropout 0.3, early stopping on validation loss with patience 10) was trained once and reported as is.
