# Phase 2 verification: ML reviewer

Independent, read-only sub-agent. It wrote its own evaluation code, retrained twice into a scratch directory, and did not touch `backend/saved_models` or `backend/artifacts`.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Metrics are real and from the held-out test set | PASS | Own keras load + saved standardizer + sklearn on the test split: accuracy 0.904153, precision 0.884000, recall 0.876984, F1 0.880478, ROC-AUC 0.960328, PR-AUC 0.940156, confusion matrix `[[345, 29], [31, 221]]`. Difference from `metrics.json`: 0. `test_predictions.csv` matches to 3e-8. |
| 2 | Metrics not hardcoded | PASS | Grep for the metric values across py/json/md/ts/sh hits only the `PROGRESS.md` table. `compute_metrics` is pure sklearn on model outputs. |
| 3a | Split by target | PASS | kepid overlap between splits: 0/0/0; stars 2389/512/512; stored split equals `split_by_target(kepid)`. |
| 3b | Standardizer fitted on train only | PASS | Refit on the train split equals the saved values exactly (2,902 samples); whole-dataset statistics differ. |
| 3c | Augmentation and class weights only on training data | PASS | `augment_batch` is called only on `x_train`; validation is passed raw; weights recomputed from `y_train` match. |
| 3d | No label- or vetting-derived column in the input | PASS | Only `koi_period`, `koi_time0bk`, `koi_duration` and flux are used; 0 label mismatches over 4,136 rows. |
| 3e | Nothing tuned on the test set | PASS | All callbacks monitor `val_loss`; fixed argmax threshold; test evaluated once. (Reviewer note: earlier untracked iterations cannot be excluded from one commit.) |
| 3f | Stored inputs rebuild from raw light curves | PASS | 15 random samples rebuilt with `process_light_curve`: exactly equal. Fresh MAST download for KIC 10666592 matches the stored file. |
| 4 | Training reproducible | PASS | Two from-scratch runs: 38 epochs, best epoch 28, metrics and per-epoch loss identical to the shipped run. |
| 5 | Model reloads and predicts identically | PASS | Two loads give identical arrays on the 626 test rows. |
| 6 | Same preprocessing for training and inference; configs saved | PASS | `Predictor.predict` on raw curves equals `predict_views` on stored rows; all config and history files present. |
| 7 | IG, saliency, occlusion are real | PASS | IG completeness error at most 7.2e-3 (64 steps), 7.6e-4 (512 steps); saliency matches finite differences; occlusion matches a manual single-window check. |
| 8 | pytest passes; tests meaningful | PASS | 38 passed, no skips or xfails. |
| 9 | Architecture and training setup | PASS | Conv1D 32/5, 64/5, 128/3 with BN, ReLU, two MaxPools, GAP, Dense(64), Dropout, softmax; 44,642 parameters; seeds, Adam, EarlyStopping, ReduceLROnPlateau, ModelCheckpoint, class weights, callback hook, stop flag. |
| 10 | Weaknesses recorded honestly | PASS | Recall and precision lead the table; misses and false alarms stated. |

Integrity violations: none found.

## Low-severity issues and what was done

| # | Issue | Action |
|---|---|---|
| 1 | Detrending flattens 16 samples (0.4%) to all-zero inputs on highly variable stars; not listed as a weakness | Documented in `PROGRESS.md` and `DECISIONS.md` D10. Pipeline left unchanged (no changes after seeing test results). |
| 2 | Standardizer std computed in float32, 0.1% off the float64 value | Documented; consistent in training and inference. |
| 3 | `python -m backend.ml.evaluate` printed but did not fail on a mismatch | Now exits non-zero on any mismatch. |
| 4 | Artifact test omitted `plots/pr_curve.png` | Added to the test. |
| 5 | The `confidence` key is the max softmax value; UI must not present it as planet probability | Carried into the frontend: every result shows the softmax disclaimer. |
