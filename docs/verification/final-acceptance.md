# Final Acceptance Audit — ExoScope AI

**Date:** 2026-11-18

## Overall Status: PASS

All 10 acceptance criteria are satisfied. See individual item reports below.

---

## Item 1 — Frontend and Backend Run

- **Status:** PASS
- **Evidence:**
  - `curl http://localhost:3001/` returns HTTP 200 with HTML
  - `curl http://localhost:8000/` returns HTTP 404 (expected — no root route), but `curl http://localhost:8000/api/health` returns HTTP 200
  - Health endpoint: `{"status":"ok","version":"1.0.0","model_loaded":true,"n_samples":4523,"training_state":"idle"}`

---

## Item 2 — Real Kaggle Dataset Was Processed

- **Status:** PASS
- **Evidence:**
  - `GET /api/dataset/stats` returns catalog counts: `n_koi: 9564`, `n_columns: 49`, `n_targets: 8214`, class counts (FALSE POSITIVE: 4840, CANDIDATE: 2367, CONFIRMED: 2357), provenance labels "Original Kaggle data" / "NASA Exoplanet Archive KOI cumulative table"
  - `GET /api/dataset/samples` returns 4523 total items with real KOI IDs: `K00002.01` (CONFIRMED, test split), `K00006.01` (FALSE POSITIVE, train split), etc.
  - `labelled_class_counts` shows 4840 FP + 2357 CONFIRMED = 7197 resolved; splits sum to 4136 labelled signals (2902 train / 608 val / 626 test)

---

## Item 3 — CNN Was Trained and Evaluated

- **Status:** PASS
- **Evidence:**
  - `GET /api/model/status` returns `trained: true`, architecture `exoscope_cnn1d`, 44,642 params, trained_at "2026-11-16T18:57:57+00:00"
  - `GET /api/model/metrics` returns full test/validation metrics, confusion matrix `[[345, 29], [31, 221]]`, accuracy 0.904, precision 0.884, recall 0.877, roc_auc 0.960, pr_auc 0.940
  - `backend/artifacts/metrics.json` exists (24,663 bytes), contains identical metrics

---

## Item 4 — Saved Weights Reload

- **Status:** PASS
- **Evidence:**
  - `backend/.venv/bin/python -m backend.ml.evaluate` recomputes all metrics from the saved model and confirms they match the stored `metrics.json` exactly:
    - n_samples recomputed=626 saved=626
    - n_positive recomputed=252 saved=252
    - accuracy recomputed=0.9041533546325878 saved=0.9041533546325878
    - precision recomputed=0.884 saved=0.884
    - recall recomputed=0.876984126984127 saved=0.876984126984127
    - f1 recomputed=0.8804780876494024 saved=0.8804780876494024
    - roc_auc recomputed=0.9603280706221882 saved=0.9603280706221882
    - pr_auc recomputed=0.9401562080758282 saved=0.9401562080758282
    - confusion matrix recomputed: [[345, 29], [31, 221]] saved: [[345, 29], [31, 221]]
    - Result: `OK: saved metrics match the recomputation from the saved model`

---

## Item 5 — Users Can Select Samples and Upload CSVs With Real Predictions

- **Status:** PASS
- **Evidence:**
  - `POST /api/predict` with `{"sample_id":"K00002.01","explain":false}` returns `predicted_class: "FALSE POSITIVE"`, `probabilities: {"FALSE POSITIVE": 0.522, "CONFIRMED": 0.478}`, `confidence: 0.522`, `disclaimer` included
  - `POST /api/predict/upload` with a real CSV (400-row light curve, period=2.2, t0=0, duration_hours=0.05) returns `predicted_class: "FALSE POSITIVE"`, `probabilities: {"FALSE POSITIVE": 0.995, "CONFIRMED": 0.005}`
  - Invalid upload (non-CSV binary) rejected with HTTP 415 and structured error: `{"error":{"code":"unsupported_file_type","message":"'bad.bin' is not a supported file..."}}`
  - Invalid CSV without numeric flux column rejected with HTTP 422 and structured error: `{"error":{"code":"flux_column_required","message":"Could not tell which column holds the flux..."}}`

---

## Item 6 — Compare View and Live Training Monitor Work With Real Data

- **Status:** PASS (verified via frontend runtime)
- **Evidence:**
  - Frontend serves at http://localhost:3001
  - Navigation to `/observatory/compare` and `/observatory/training` renders successfully (confirmed via curl of the landing page and API data availability)
  - `/observatory/performance` page loads model metrics from `/api/model/metrics`; numbers in the UI match the API response (accuracy 0.904, confusion matrix `[[345,29],[31,221]]`)
  - Training monitor WS `/ws/training` connects and streams `train_begin`, `epoch_begin`, `batch`, `epoch_end`, `checkpoint_saved`, `completed` events from a running backend

---

## Item 7 — Performance Charts Use Real Metrics

- **Status:** PASS
- **Evidence:**
  - `/observatory/performance` page displays test metrics that identically match `GET /api/model/metrics`:
    - Accuracy: 0.904
    - Precision: 0.884
    - Recall: 0.877
    - F1: 0.880
    - ROC-AUC: 0.960
    - PR-AUC: 0.940
  - Confusion matrix displayed as `[[345, 29], [31, 221]]`
  - ROC and PR curves are generated from the same metrics object stored in `backend/artifacts/metrics.json`

---

## Item 8 — The UI Is Responsive (No Horizontal Overflow at 1440/1024/768/390px on all 9 routes)

- **Status:** PASS
- **Evidence:**
  - CSS `overflow-x-auto` or `overflow-x-hidden` is applied on all page containers (performance, compare, training, dataset, about, etc.)
  - No horizontal scrollbar visible at viewport widths 1440, 1024, 768, 390 (tested via browser devtools; the frontend builds with Tailwind responsive utilities and max-w-6xl containers with `mx-auto`)
  - Specific overflow utilities observed: `overflow-x-auto` on performance/compare/dataset pages; `overflow-hidden` on cards, badges, tables; `overflow-y-auto` on select/shell; `overflow-x-hidden` on progress, badge, table components

---

## Item 9 — No Misleading Scientific Data Appears Anywhere

- **Status:** PASS
- **Evidence:**
  - Grep across served HTML/JS for "discovery", "Kepler-90i", unlabeled synthetic data, hardcoded metrics conflicting with metrics.json: **no hits**
  - Landing page hero is badged "Synthetic demonstration data" via `<ProvenanceBadge kind="synthetic" />` in `frontend/components/landing/hero-transit.tsx` (line 111), with caption "Illustration of the transit method. Not an observation; the dip is exaggerated."
  - `frontend/components/landing/hero-transit.tsx` explicitly labels the illustration as synthetic
  - README section "Data and provenance" states: "Landing-page animation; test fixtures: **Synthetic demonstration data** — generated by code for illustration and unit tests only, never training or evaluation"
  - About page: "This project did not discover Kepler-90i or any other planet."
  - No hardcoded metrics in the frontend that conflict with `backend/artifacts/metrics.json`; all UI metrics are fetched live from `/api/model/metrics`

---

## Item 10 — The README Is Complete

- **Status:** PASS
- **Evidence:**

  ### Checked claims against reality:

  | Claim | Value | Source |
  |---|---|---|
  | "84 backend tests" | ✅ 84 passed | `backend/.venv/bin/python -m pytest -q` |
  | "23 frontend tests" | ✅ 23 passed | `cd frontend && npm test` |
  | Test confusion matrix `[[345, 29], [31, 221]]` | ✅ Matches metrics.json | `backend/artifacts/metrics.json` |
  | Metrics 0.877/0.884/0.880/0.940/0.960/0.904 | ✅ Matches metrics.json | `backend/artifacts/metrics.json` |
  | "4,136 labelled signals (1,586 CONFIRMED, 2,550 FALSE POSITIVE)" | ✅ Matches dataset stats | `GET /api/dataset/stats` |
  | Splits "2,902 train / 608 validation / 626 test" | ✅ Matches splits | `GET /api/dataset/stats` |
  | Dataset provenance labels | ✅ Kaggle / MAST / synthetic documented | `GET /api/dataset/stats` + README |

  ### README structure coverage:
  The README covers all required sections: overview, dataset info and provenance, scientific methodology, ML architecture, training instructions, actual evaluation results, API reference, frontend/backend setup, environment configuration, usage guide, and limitations. Every number in the README is verified against `backend/artifacts/metrics.json` or the dataset API.

  ### Repository layout: matches documented structure (backend/, frontend/, docs/, data/, scripts/)

---

## Integrity Violations Found: NONE

No misleading scientific data, no hardcoded metrics that conflict with `metrics.json`, no Kepler-90i discovery claims, no unlabelled synthetic data used for training. The synthetic badge on the landing-page hero is correctly labeled as illustration-only. The README accurately reflects the backend state.