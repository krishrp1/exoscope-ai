# Progress

## Phase 1: Discovery and data reality check (done)

**Done**
- Repo skeleton, Python 3.12 virtualenv (`backend/.venv`), `backend/requirements.txt`.
- Downloaded `arashnic/exoplanets` with kagglehub (worked without Kaggle credentials; the dataset is public).
- Inspected it: one CSV, the KOI catalog, 9,564 rows by 49 columns, **no light curves**.
- Fetched genuine Kepler light curves from MAST for 3,546 stars (3,546 succeeded, 0 failed) with `backend/ml/fetch_lightcurves.py`.
- `backend/scripts/dataset_audit.py` computes every statistic in `docs/DATASET_REPORT.md` and stores them in `docs/dataset_stats.json`.

**Decisions:** D1 to D9 in `DECISIONS.md`. The main one: the task is CONFIRMED vs FALSE POSITIVE on phase-folded real Kepler light curves, with CANDIDATE rows excluded.

**Open issues**
- Using all KOIs on fetched stars raises the positive share to 38.3% (catalog: 32.7%).
- 43% of labelled KOIs were not fetched (download time). `scripts/setup_data.sh` can fetch more by raising the counts.
- Process note: while the 20-minute download ran, code for Phases 2 and 3 was drafted. The verification gates were still applied in phase order.

## Phase 2: ML pipeline and 1D CNN (done)

**Done**
- `preprocessing.py`: clean, segment, detrend, clip, fold, bin (global and local views, 256 bins each), per-view normalization, train-only standardizer, split by host star. Same function for training and inference.
- `model.py`: Conv1D(32,5) BN ReLU MaxPool, Conv1D(64,5) BN ReLU MaxPool, Conv1D(128,3) BN ReLU, GlobalAveragePooling, Dense(64), Dropout, Softmax(2).
- `train.py`: callable with an event callback and a stop flag; seeds fixed; Adam, EarlyStopping, ReduceLROnPlateau, ModelCheckpoint, class weights.
- `evaluate.py`, `predict.py`, `explainability.py` (saliency, Integrated Gradients, occlusion).
- 38 unit tests (preprocessing, leakage checks, model shape, training artifacts, reload, explainability).

**Real results (test split: 626 signals on 512 stars, 252 positive)**

| Metric | Value |
|---|---|
| Recall (CONFIRMED) | 0.877 |
| Precision (CONFIRMED) | 0.884 |
| F1 (CONFIRMED) | 0.880 |
| PR-AUC | 0.940 |
| ROC-AUC | 0.960 |
| Accuracy | 0.904 |

Confusion matrix (rows true, columns predicted; FALSE POSITIVE, CONFIRMED): `[[345, 29], [31, 221]]`. Trained 38 epochs, best epoch 28, early stopped, 13.6 s on CPU. Re-running evaluation from the saved model reproduces every number exactly (`python -m backend.ml.evaluate`).

**Weaknesses**
- 31 of 252 confirmed planets in the test set are missed, and 29 false positives are called planets.
- Validation loss is noisy from epoch to epoch (for example 0.20 then 0.35), so the chosen checkpoint depends on that noise.
- One training run, one seed, no hyperparameter search, no confidence intervals.
- Test prevalence is 40%, higher than the catalog's 33%; precision would be lower at catalog prevalence.
- 16 samples (0.4%) are flattened to an all-zero input by the detrending step (D10); the model sees no signal for them.
- The standardizer's standard deviation is computed in float32 and differs from the float64 value by about 0.1%. It is applied identically in training and inference.
- The model depends on a correct ephemeris. Performance with estimated (BLS) ephemerides was not measured.

**Decisions:** D10 to D16.
