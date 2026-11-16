#!/usr/bin/env bash
# Start the FastAPI backend on http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")/.."
exec backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port "${PORT:-8000}"
