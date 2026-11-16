#!/usr/bin/env bash
# Reproduce the data and the model from scratch: Kaggle catalog -> MAST light curves -> processed views -> trained CNN.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=backend/.venv/bin/python
$PY -m backend.ml.fetch_lightcurves --n-confirmed 1200 --n-false-positive 2464 --n-candidates 150
$PY -m backend.ml.preprocessing
$PY -m backend.ml.train
