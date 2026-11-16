# ExoScope AI: Phase-by-Phase Build Prompt

How to use: paste this **entire file as one prompt** into Claude Code and leave it running. It is designed to run **unattended, start to finish, in one stretch**. Each phase is gated by an independent verifier sub-agent, and the run ends with a full independent audit.

Before you start (the only things the agent cannot do alone):
- Run it in Claude Code on your own machine (not a sandbox) so Kaggle downloads, `pip`, and `npm` all work.
- Have Kaggle credentials configured (`~/.kaggle/kaggle.json` or `KAGGLE_USERNAME`/`KAGGLE_KEY`), and Python 3.10+ and Node 20+ installed.
- CPU training is fine; keep the model small.

---

## PART 0: Master Context (applies to every phase)

**Project:** ExoScope AI, a full-stack deep-learning exoplanet detection platform. It is a serious portfolio project for technical interviews. It must be fully functional, not a mockup.

**Tagline:** "Discover Worlds Beyond Our Stars."

**Stack**
- Backend: Python 3, FastAPI, TensorFlow/Keras, NumPy, Pandas, scikit-learn, SciPy, Matplotlib.
- Frontend: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Framer Motion, Plotly.js (scientific plots), Recharts (dashboard analytics), Lucide.
- Communication: REST plus WebSocket or SSE (training stream). Pydantic validation on the backend, typed responses on the frontend.

**Dataset (mandatory):** `kagglehub.dataset_download("arashnic/exoplanets")`. Do not substitute another dataset. Do not assume it contains raw light curves. Inspect first.

**Scientific integrity rules (non-negotiable)**
1. Never fabricate light curves, metrics, predictions, or training progress. Never hardcode evaluation results.
2. Label every data source in code, docs, and UI as one of: **Original Kaggle data**, **Additional genuine astronomical observations** (with source), or **Synthetic demonstration data**. Never present synthetic data as NASA data.
3. Do not relabel unrelated categories as transit classes. Use the dataset's real labels.
4. Softmax confidence is not the probability that something is a confirmed planet. Say so in the UI.
5. Model explanations (saliency / Integrated Gradients / perturbation) are explanations of the model, not confirmed physical transit detections. Only show methods that are actually implemented.
6. Do not claim this project discovered Kepler-90i. It is only inspired by Google's deep-learning Kepler work.
7. Fit normalization on training data only. Split by astronomical target to avoid leakage.
8. If a requirement is blocked by the data, explain why and implement the most scientifically defensible alternative. Do not paper over it.

**Visual direction (used in Phases 4 to 6):** a NASA mission-control / deep-space observatory feel.
- Colors: bg `#050816`, secondary bg `#0B1020`, cards `#111A2E`, primary accent `#38BDF8`, secondary accent `#A78BFA`, text `#F8FAFC`, muted text `#94A3B8`, soft green for success, amber for warning.
- Elements: subtle animated starfield, nebula gradients, glowing cyan highlights, thin borders, layered glass surfaces, orbital animations.
- Type: Geist or Inter for UI, monospace for measurements and metadata.
- Motion: purposeful Framer Motion only. Never let animation interfere with data readability.
- Responsive: desktop is the most polished, with working tablet and mobile layouts.

**Working rules**
- Keep a `PROGRESS.md` at the repo root. At the end of each phase, record what was done, decisions made and why, and open issues.
- Make one git commit per phase (more are fine). Commits must be authored by me only. Do not add any `Co-Authored-By` or Claude attribution lines.
- Use `.gitignore` for data, model weights, `node_modules`, `.env`, and caches. Provide `.env.example`.
- Use a task list. The last item of every phase is "verify by running it".
- Write tests as you go, not at the end.

**Autonomy rules (I will not be available while you work)**
- Run all seven phases back to back in one session. Do not stop to ask questions, offer plans, or wait for approval between phases.
- When a decision is ambiguous, take the most scientifically defensible and reversible option, and log it in `DECISIONS.md` (decision, alternatives considered, why). Keep going.
- Stop early only for a true blocker you cannot work around (for example, Kaggle credentials are missing or the network is down). In that case do all the remaining work that does not depend on it, write `BLOCKERS.md` explaining exactly what I must do, and finish.
- If something fails, debug and fix it. Do not skip a failing test, weaken an assertion, or delete a feature to get green. If a feature truly cannot work, document why in `PROGRESS.md` and implement the valid alternative.
- Never mark a task done on the strength of "it should work." Run it and look at the output.

**Verification protocol (sub-agents)**
You are the builder. After each phase, you must spawn a **fresh verifier sub-agent** that has not seen your work being produced, so the work is not grading itself. Give the verifier only: the phase's goal, its exit criteria, the Part 0 integrity rules, and the repo path. Instruct it to be adversarial and read-only (it reports, it does not fix), and to **run things for real** (tests, servers, `curl`, builds) rather than trust code or your claims.

Each verifier returns a structured report: `PASS` or `FAIL` per exit criterion, with the evidence (commands run and output), plus a list of any integrity violations found (hardcoded or fabricated values, placeholder predictions, dead buttons, leakage, mislabelled data). You then fix every `FAIL` and re-run the verifier on the failed items until all pass. Save each report to `docs/verification/phase-N.md`. A phase is not complete, and the next one may not start, until its verifier passes.

Verifier specializations:
- **Phase 1:** a data auditor, who re-derives the dataset statistics independently and checks `DATASET_REPORT.md` claims against the raw files.
- **Phase 2:** an ML reviewer, who hunts for leakage (split level, normalization fit, augmentation on val/test), re-runs evaluation from saved artifacts to confirm the metrics match, and checks the metrics were not hardcoded.
- **Phase 3:** an API tester, who exercises every endpoint, invalid uploads, oversized files, duplicate training starts, and consumes the live WS/SSE stream.
- **Phases 4 to 6:** a UI tester, who drives the running app in a browser (Playwright or a browser tool), clicks every button and nav link, tests desktop and mobile widths, checks console errors, and confirms each page shows real backend data with working error and empty states.
- **Phase 7 / final:** see the Final Independent Audit in Phase 7.

You may run independent verifiers in parallel when their scopes don't overlap.

**Repo layout (adapt if needed)**
```
exoscope-ai/
├── frontend/            # Next.js app (app/, components/, hooks/, lib/, types/, public/)
├── backend/
│   ├── main.py
│   ├── api/
│   ├── ml/              # dataset.py preprocessing.py model.py train.py evaluate.py predict.py explainability.py
│   ├── saved_models/
│   ├── artifacts/
│   ├── tests/
│   └── requirements.txt
├── data/
├── docs/
├── PROGRESS.md
├── README.md
├── .gitignore
└── .env.example
```

---

## PHASE 1: Discovery and Data Reality Check

**Goal:** know exactly what the Kaggle data is before designing anything.

**Do**
1. Inspect the working directory. Create the repo skeleton, a Python virtualenv, and `requirements.txt`.
2. Download the dataset with kagglehub (path printed). If Kaggle credentials are missing and cannot be resolved, follow the blocker rule in Part 0.
3. Inspect every downloaded file: formats, shapes, column names, dtypes, target labels, class distribution, missing values, duplicates, value ranges.
4. Decide and document: **does it contain real time-series light curves** (flux over time per target)? Is there a time axis or only flux columns? What is the sampling cadence, if known?
5. Establish the actual ML task and the label semantics (what the classes really mean).
6. Quantify class imbalance and the number of positive examples. State plainly whether that is enough to train a CNN, and what mitigations you'll use.
7. If the data is tabular-only (no time series), investigate whether genuine light curves can be fetched for the listed targets from documented sources (for example MAST via `lightkurve`). Preserve the Kaggle dataset as the starting point. If this isn't feasible, choose the most scientifically defensible alternative yourself, log the reasoning in `DECISIONS.md`, and proceed. Never fabricate or pass off tabular features as time series.
8. Write `docs/DATASET_REPORT.md` covering everything above plus a provenance table (Original Kaggle / Additional genuine / Synthetic).

**Exit criteria**
- `DATASET_REPORT.md` exists and every claim in it comes from code you ran.
- The ML task, classes, and data source are decided and logged in `DECISIONS.md`.
- **Gate:** the data-auditor verifier passes. Then continue straight to Phase 2.

---

## PHASE 2: ML Pipeline and 1D CNN

**Goal:** a real, trained, evaluated model with saved artifacts.

**Do**
1. `preprocessing.py`: a reproducible pipeline covering loading, missing-value handling, duplicate handling, label encoding, light-curve extraction, noise handling (for example detrending and outlier clipping, justified), normalization, segmentation, fixed-length standardization, and a **target-level** train/val/test split. Normalization is fitted on train only. The exact same code path is used for training and inference. Save the preprocessing config.
2. Handle class imbalance (class weights and/or training-split-only augmentation or resampling). Never touch the val/test sets.
3. `model.py`: start from this architecture and adapt to the real input shape and number of classes:
   Conv1D(32, k=5) → BN → ReLU → MaxPool → Conv1D(64, k=5) → BN → ReLU → MaxPool → Conv1D(128, k=3) → BN → ReLU → GlobalAveragePooling1D → Dense(64) → Dropout → Softmax.
4. `train.py`: fixed seeds, Adam, an appropriate loss, EarlyStopping, ReduceLROnPlateau, ModelCheckpoint, class weights, and history logging. Expose a callback hook so Phase 3 can stream events. Training must be runnable as a function with a stop flag, not only as a script.
5. `evaluate.py`: on the held-out test set compute accuracy, precision, recall, F1, ROC-AUC, **PR-AUC**, confusion matrix, and per-class metrics. Generate and save the accuracy curve, loss curve, ROC curve, and confusion-matrix heatmap. Because of imbalance, report positive-class recall and precision prominently, not just accuracy.
6. Save to `saved_models/` and `artifacts/`: model, model config, preprocessing config, label mapping, training history, evaluation metrics JSON.
7. `predict.py`: load once, expose `predict(flux, time=None)` returning class probabilities. Verify that a saved model loads and reproduces the same predictions.
8. `explainability.py`: implement Integrated Gradients, saliency, and an input-perturbation (occlusion) analysis. Only expose what actually works.
9. Unit tests for preprocessing (including no-leakage and train-only-fit checks), model shape, and predict.

**Exit criteria**
- Training ran from scratch. Metrics are real and come from the held-out test set.
- Saved model reloads and predicts.
- `pytest` passes.
- Record the actual metrics honestly, including weaknesses. If results are poor or the test set has very few positives, say so. Do not tune on the test set.
- **Gate:** the ML-reviewer verifier passes.

---

## PHASE 3: FastAPI Backend

**Goal:** a robust API around the real model, including live training events.

**Do**
1. Endpoints (adapt as needed): `GET /api/health`, `/api/dataset/stats`, `/api/dataset/samples`, `/api/dataset/samples/{id}`, `/api/model/status`, `/api/model/metrics`, `POST /api/predict`, `/api/predict/upload`, `/api/predict/batch`, `POST /api/training/start`, `/api/training/stop`, `GET /api/training/status`, `/api/training/history`, and `WS /ws/training` (or SSE).
2. Load the model **once at startup**. Inference never retrains. If no model exists, return a clear "not trained" state, not an error.
3. CSV upload: size limit, content-type and extension validation, safe parsing (no execution of uploaded content), time/flux column mapping, missing-value handling, the same preprocessing as training, and graceful rejection with useful error messages.
4. Prediction responses return: predicted class, per-class probabilities, processed signal, explanation (attribution arrays plus the method name), and processing info with real timings per stage.
5. Training manager: one job at a time (reject duplicates with 409), safe stop, status, and real events streamed over WS/SSE (epoch, batch progress, losses, accuracies, learning rate, checkpoint saved, errors, completion). After completion, save artifacts and hot-swap the new model for inference.
6. Pydantic models, structured JSON errors, logging, CORS from env config, `.env` config.
7. Tests for the API (health, stats, predict, upload happy path, invalid upload, training start/stop/duplicate), using FastAPI's test client.

**Exit criteria**
- Backend starts cleanly and every endpoint is hit with real requests (show the curl output).
- A real training run streams real events to a WS client script.
- `pytest` passes.
- **Gate:** the API-tester verifier passes.

---

## PHASE 4: Frontend Core and Landing Page

**Goal:** the app shell, the data layer, and the cinematic entry.

**Do**
1. Initialize Next.js + TypeScript + Tailwind + shadcn/ui. Set up the theme, fonts, global starfield, and a typed API client (`lib/api.ts`, `types/`) with a single base URL from env. Add hooks for data fetching and for the training stream.
2. Dashboard shell with a collapsible sidebar and routes: Overview, Light Curve Explorer, AI Detection Studio, Compare Signals, Training Monitor, Model Performance, Dataset Explorer, About & Methodology. Add page transitions plus loading, empty, and error states used consistently. Add responsive behavior (sidebar becomes a drawer on mobile).
3. Landing page:
   - Hero: headline, supporting text, and the CTAs "Enter the Observatory" and "Explore the Science".
   - Custom SVG/canvas hero: a star, an orbiting planet, the planet crossing the star, and a **synchronized, animated brightness graph** showing the transit dip.
   - Sections: The Search for Exoplanets, How Transit Detection Works, Why Deep Learning?, Inside the 1D CNN, The Kepler Dataset, Explore the Observatory. Use smooth scroll reveals.
   - The hero transit curve is an illustration, so label it as such.
4. The Overview page is built in Phase 5 with real data. Here, only the shell and navigation need to work.

**Exit criteria**
- `npm run build` passes with no type errors.
- Landing page renders. CTAs navigate. Every sidebar link leads to a real page, even if a placeholder, and no dead buttons exist.
- Check screenshots at desktop and mobile widths (use a browser tool if available).
- **Gate:** the UI-tester verifier passes.

---

## PHASE 5: Feature Pages and Integration

**Goal:** every page works against the real backend. Build and verify in this order, one page at a time.

1. **Overview:** real dataset size, class counts, available light curves, model accuracy, model status, last training time, class-distribution chart, recent predictions, sample curves, dataset-health indicators. If the model is untrained, show a proper "not trained" state and fabricate nothing.
2. **Dataset Explorer:** search, filter, sort, pagination, row selection, a target-detail view, stats, class distribution, and light-curve previews. Every number comes from the API.
3. **Light Curve Explorer (Plotly):** time vs. flux, zoom/pan/hover/range select/reset, sample selection, transit-region highlighting only where supported by real data, raw vs. normalized toggle, metadata (target ID, observation count, duration, flux and time range, dataset label). Synthetic examples are clearly badged.
4. **AI Detection Studio:**
   - Input A: search/filter dataset samples, preview, run classification.
   - Input B: drag-and-drop CSV, validation, parsing, time/flux column mapping UI, missing-value handling, clear format instructions, and graceful rejection.
   - Analysis stages (Loading → Validating → Normalizing → Extracting features → CNN inference → Preparing results) tied to real backend stage timings.
   - Results: predicted class, confidence, probability distribution, interactive curve, signal characteristics, explanation overlay (implemented methods only), processing info, and the softmax disclaimer.
5. **Compare Signals:** pick 2+ signals, side-by-side and shared-normalized views, synchronized zoom, dataset labels, CNN predictions and confidence, and explanation overlays. Include genuine examples of the available classes. Eclipsing-binary-like, variability, and noisy examples may be used only if they are real or clearly labeled synthetic.
6. **Training Monitor:** start and safe-stop controls, status, epoch and batch progress, LR, train/val loss and accuracy, ETA only when reliable, and live charts (accuracy, loss, validation, LR history) fed by the **real** WS/SSE stream. When idle, show the last completed run's history. Handle disconnects and errors, and block duplicate starts in the UI.
7. **Model Performance:** real metrics, confusion matrix, ROC (and PR) curve, training curves, class distribution, plus concise explanations of the architecture, temporal feature extraction, overfitting, class imbalance, false positives, and limitations.
8. **About & Methodology:** an 8-step pipeline walkthrough, architecture diagram, data-pipeline diagram, ML workflow, stack, dataset attribution, research inspiration, and honest limitations. It should work as an interview talking-points page.

**Exit criteria**
- Each page loads real data. Loading, empty, and error states work. No fabricated values.
- End-to-end checks pass: dataset-sample prediction, CSV upload prediction, invalid-file rejection, a live training run visible in the monitor.
- **Gate:** after every two or three pages (not only at the end), spawn a UI-tester verifier for those pages. A final UI-tester pass covers all eight pages before Phase 6 begins.

---

## PHASE 6: Polish, Responsiveness, Accessibility, Testing

**Do**
- Refine animations (reveals, chart entrances, result reveals) while keeping data readable.
- Fix responsive issues at 1440 / 1024 / 768 / 390 px.
- Improve loading skeletons and error boundaries. Memoize and lazy-load heavy Plotly components. Check bundle size and API caching.
- Accessibility: keyboard navigation, focus states, ARIA labels, contrast, and `prefers-reduced-motion` support.
- Run the full backend test suite and frontend type-check/lint, plus a few frontend tests for the API client and key components. Add one end-to-end smoke script covering predict, upload, and training stream.
- Fix every bug found. Search for leftover placeholders, `TODO`s, and hardcoded numbers.

**Exit criteria:** all tests pass, a clean production build works, and a written list of any remaining known issues.

**Gate:** a UI-tester verifier re-runs the full click-through at all four widths, plus an accessibility check (keyboard-only navigation, reduced motion).

---

## PHASE 7: Documentation and Final Report

**Do**
- Write `README.md` covering: overview, dataset info and provenance, scientific methodology, ML architecture, training instructions, **actual** evaluation results (copied from the real metrics file), API reference, frontend and backend setup, environment configuration, usage guide, and limitations.
- Add `docs/` with the dataset report, architecture and pipeline diagrams, and an interview talking-points file (design decisions, trade-offs, what I'd do next).
- Final cleanup: `.env.example`, `.gitignore`, and a single-command (or two-command) startup path for backend and frontend.

**Final Independent Audit (required before declaring completion)**
Spawn these verifier sub-agents in parallel, each fresh and adversarial:
1. **Fresh-clone tester:** clone or copy the repo into a clean directory, follow *only* the README to install and start the backend and frontend, and report every step that fails or is unclear. Fix the README or code until the setup works exactly as documented.
2. **Acceptance auditor:** check each item of the acceptance check below with evidence, and fail anything unproven.
3. **Integrity auditor:** grep and review the entire repo and UI for hardcoded metrics, placeholder or random predictions, fabricated stats, unlabeled synthetic data, dead buttons, `TODO`s, and claims that conflict with the Part 0 integrity rules. Confirm that every number in the README matches the real metrics file.
4. **Interview reviewer:** read the project as a skeptical interviewer. List the five hardest technical questions it can't yet answer, and confirm the talking-points doc covers them.

Fix every finding, re-run the failed audits, and save the reports to `docs/verification/final-*.md`. Only then write the final report.

**Final report (concise)**
1. What was implemented.
2. How the Kaggle dataset was used (and what, if anything, was added or synthetic).
3. Actual model evaluation results, including weaknesses.
4. How to start the application.
5. Remaining limitations.
6. Summary of verifier results (what failed at first and how it was fixed), and where `DECISIONS.md` and `BLOCKERS.md` (if any) are.

**Acceptance check (all must be true):** frontend and backend run; the real Kaggle dataset was processed; the CNN was trained and evaluated; saved weights reload; users can select samples and upload CSVs and get real predictions with probabilities; the compare view and live training monitor work with real data; the performance charts use real metrics; the UI is responsive; no misleading scientific data appears anywhere; and the README is complete.
