"""Training control endpoints and the live WebSocket event stream."""
from __future__ import annotations

import asyncio
import re

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.ml.train import TrainParams

from .errors import ApiError
from .schemas import TrainingStartRequest
from .settings import get_settings
from .state import state
from .training_manager import TrainingAlreadyRunning, TrainingNotRunning

router = APIRouter(tags=["training"])


def _require_training_enabled() -> None:
    if not get_settings().training_enabled:
        raise ApiError(403, "training_disabled", "Training is disabled on this deployment. Saved results are still shown.")


@router.post("/api/training/start", status_code=202)
def start_training(req: TrainingStartRequest | None = None) -> dict:
    _require_training_enabled()
    req = req or TrainingStartRequest()
    cap = get_settings().max_train_epochs
    if req.epochs > cap:
        raise ApiError(422, "too_many_epochs", f"This server allows at most {cap} epochs per run.")
    params = TrainParams(epochs=req.epochs, batch_size=req.batch_size, learning_rate=req.learning_rate,
                         dropout=req.dropout, augment=req.augment)
    try:
        return {"started": True, "status": state.training.start(params)}
    except TrainingAlreadyRunning:
        raise ApiError(409, "training_already_running", "A training job is already running. Stop it first or wait.",
                       {"run_id": state.training.status.get("run_id")})


@router.post("/api/training/stop")
def stop_training() -> dict:
    _require_training_enabled()
    try:
        return {"stopping": True, "status": state.training.stop()}
    except TrainingNotRunning:
        raise ApiError(409, "training_not_running", "No training job is running.")


@router.get("/api/training/status")
def training_status() -> dict:
    return state.training.snapshot()


@router.get("/api/training/history")
def training_history() -> dict:
    """History of the last completed (saved) run, plus the current or most recent live run."""
    saved = state.read_artifact("training_history.json")
    live = state.training.snapshot()
    return {
        "last_completed": saved,
        "current": {"state": live["state"], "run_id": live["run_id"], "history": live.get("history"),
                    "params": live.get("params"), "started_at": live.get("started_at"),
                    "finished_at": live.get("finished_at")} if live["run_id"] else None,
    }


@router.websocket("/ws/training")
async def training_stream(ws: WebSocket) -> None:
    """Sends a snapshot on connect, then every training event as it happens, plus heartbeats."""
    origin = ws.headers.get("origin")  # browsers always send it; scripts usually do not
    s = get_settings()
    if origin is not None and origin not in s.cors_origin_list and not re.fullmatch(s.cors_origin_regex, origin):
        await ws.close(code=1008, reason="origin not allowed")
        return
    await ws.accept()
    queue = state.training.subscribe()
    try:
        await ws.send_json({"type": "snapshot", "status": state.training.snapshot(),
                            "events": state.training.events[-500:]})
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
            except asyncio.TimeoutError:
                event = {"type": "heartbeat", "state": state.training.status.get("state")}
            await ws.send_json(event)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        state.training.unsubscribe(queue)
