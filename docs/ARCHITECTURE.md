# Architecture

ExoScope AI is a three-tier system: a Kaggle-derived dataset, a FastAPI backend that trains and serves a 1D CNN, and a Next.js observatory frontend.

## High-level data flow

```
Kaggle KOI catalog ──► MAST light-curve fetch ──► phase-fold + bin ──► CNN ──► predictions
       (9,564 rows)       (3,546 stars)         (4,136 signals)      (626 test)
```

## Backend

`backend/main.py` mounts the FastAPI app from `backend/api/`.

| Module | Role |
|---|---|
| `api/settings.py` | Environment configuration from `.env` |
| `api/state.py` | In-memory server state: model, training job, recent predictions |
| `api/routes_dataset.py` | `/api/dataset/*` — catalog stats, sample list, sample detail |
| `api/routes_model.py` | `/api/model/*` — status, metrics, evaluation plots |
| `api/routes_predict.py` | `/api/predict/*` — single, batch, CSV upload, upload inspection |
| `api/routes_training.py` | `/api/training/*` and `WS /ws/training` |
| `api/uploads.py` | CSV parsing, column mapping, size and content validation |
| `api/training_manager.py` | One training job at a time, safe stop, WebSocket event stream |
| `api/errors.py` | Structured `{"error": {"code", "message", "details"}}` responses |

`ml/` holds the scientific code:

| Module | Role |
|---|---|
| `ml/config.py` | Model and preprocessing hyperparameters |
| `ml/dataset.py` | Load the Kaggle catalog and the fetched FITS light curves |
| `ml/preprocessing.py` | Clean, segment, detrend, clip, fold, bin, normalize — one function used by training and inference |
| `ml/model.py` | The 1D CNN |
| `ml/train.py` | Training loop with an event callback and a stop flag |
| `ml/evaluate.py` | Held-out metrics, curves, confusion matrix |
| `ml/predict.py` | Load once, `predict(flux, time=None)` |
| `ml/explainability.py` | Saliency, Integrated Gradients, occlusion |
| `ml/fetch_lightcurves.py` | Download genuine Kepler PDCSAP light curves from MAST |

## Model

```
Input (256, 2)            # global view + local view, 256 bins each
Conv1D(32, k=5) → BN → ReLU → MaxPool
Conv1D(64, k=5) → BN → ReLU → MaxPool
Conv1D(128, k=3) → BN → ReLU
GlobalAveragePooling1D → Dense(64, ReLU) → Dropout(0.3) → Dense(2, softmax)
```

44,642 parameters. Adam (1e-3), sparse categorical cross-entropy, inverse-frequency class weights, early stopping on validation loss (patience 10), ReduceLROnPlateau, checkpoint on best validation loss. Fixed seeds.

## Frontend

Next.js 16 App Router, TypeScript, Tailwind 4, Base UI (shadcn), Framer Motion, Plotly.js, Recharts, Lucide.

- `app/page.tsx` — landing page
- `app/observatory/` — the eight feature pages
- `components/layout/app-shell.tsx` — sidebar, mobile drawer, page transitions
- `components/charts/` — Plotly wrappers (lazy-loaded, `ssr: false`)
- `lib/api.ts` — typed API client, one base URL from `NEXT_PUBLIC_API_BASE_URL`
- `hooks/` — `useApi`, `useAction`, `useTrainingStream`

## Deployment

- Backend: `scripts/start_backend.sh` → `uvicorn backend.main:app` on `PORT` (default 8000)
- Frontend: `scripts/start_frontend.sh` → `next start` on `FRONTEND_PORT` (default 3000)
- Data and model weights are not committed; `scripts/setup_data.sh` reproduces them.