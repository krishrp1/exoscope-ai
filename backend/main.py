"""ExoScope AI backend entry point.

Run from the repository root:
    backend/.venv/bin/uvicorn backend.main:app --port 8000
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import routes_dataset, routes_model, routes_predict, routes_training
from backend.api.errors import install_error_handlers
from backend.api.settings import get_settings
from backend.api.state import state

VERSION = "1.0.0"
logger = logging.getLogger("exoscope")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper(),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    state.load_model()       # once, at startup; inference never retrains
    state.refresh_samples()
    logger.info("ready: %d dataset samples, model %s", len(state.samples),
                "loaded" if state.predictor else "not trained")
    yield
    if state.training.is_running():
        state.training.stop()
        state.training.wait(timeout=30)


app = FastAPI(title="ExoScope AI", version=VERSION, lifespan=lifespan,
              description="Deep-learning classification of Kepler transit signals.")
install_error_handlers(app)  # first, so its catch-all middleware ends up inside CORS
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origin_list,
                   allow_origin_regex=get_settings().cors_origin_regex, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])
for module in (routes_dataset, routes_model, routes_predict, routes_training):
    app.include_router(module.router)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {
        "status": "ok",
        "version": VERSION,
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model_loaded": state.predictor is not None,
        "n_samples": int(len(state.samples)),
        "training_enabled": get_settings().training_enabled,
        "training_state": state.training.status.get("state"),
        "dataset_error": state.dataset_error,
    }
