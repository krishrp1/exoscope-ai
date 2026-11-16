"""Runs one training job at a time in a background thread and fans its events out to subscribers."""
from __future__ import annotations

import asyncio
import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Callable

from backend.ml import config
from backend.ml.train import TrainParams, train_model

logger = logging.getLogger("exoscope.training")

HISTORY_KEYS = ("loss", "accuracy", "val_loss", "val_accuracy", "learning_rate")


class TrainingAlreadyRunning(RuntimeError):
    pass


class TrainingNotRunning(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class TrainingManager:
    def __init__(self, on_completed: Callable[[], None] | None = None, train_fn=train_model):
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._subscribers: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = []
        self._on_completed = on_completed
        self._train_fn = train_fn
        self._epoch_seconds: list[float] = []
        self.events: list[dict] = []
        self.status: dict = {"state": "idle", "run_id": None}

    # ------------------------------------------------------------ control

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self, params: TrainParams) -> dict:
        with self._lock:
            if self.is_running():
                raise TrainingAlreadyRunning("a training job is already running")
            self._stop = threading.Event()
            self.events = []
            self._epoch_seconds = []
            self.status = {
                "state": "running", "run_id": uuid.uuid4().hex[:12], "started_at": _now(), "finished_at": None,
                "params": params.to_dict(), "epoch": 0, "epochs": params.epochs, "batch": 0,
                "steps_per_epoch": None, "message": "starting", "error": None, "eta_seconds": None,
                "latest": {}, "history": {k: [] for k in HISTORY_KEYS}, "result": None,
            }
            self._thread = threading.Thread(target=self._run, args=(params, self._stop), daemon=True,
                                            name="exoscope-training")
            self._thread.start()
            return self.snapshot()

    def stop(self) -> dict:
        with self._lock:
            if not self.is_running():
                raise TrainingNotRunning("no training job is running")
            if self._stop.is_set():  # already stopping: do nothing twice
                return self.snapshot()
            self._stop.set()
            self.status["state"] = "stopping"
            self.status["message"] = "stop requested; finishing the current batch"
        self._publish({"type": "status", "timestamp": _now(), "message": self.status["message"], "state": "stopping"})
        return self.snapshot()

    def wait(self, timeout: float | None = None) -> None:
        if self._thread is not None:
            self._thread.join(timeout)

    def snapshot(self) -> dict:
        s = dict(self.status)
        s["history"] = {k: list(v) for k, v in self.status.get("history", {}).items()}
        s["is_running"] = self.is_running()
        return s

    # ------------------------------------------------------------ worker

    def _run(self, params: TrainParams, stop: threading.Event) -> None:
        try:
            result = self._train_fn(params, event_cb=self._handle_event, stop_flag=stop)
            if result["status"] == "completed":
                self.status.update(state="completed", message="training completed", eta_seconds=None,
                                   result={"epochs_run": result["epochs_run"], "best_epoch": result["best_epoch"],
                                           "duration_seconds": result["duration_seconds"]})
                if self._on_completed:
                    try:
                        self._on_completed()
                        self._publish({"type": "model_reloaded", "timestamp": _now(),
                                       "message": "the new model is now serving predictions"})
                    except Exception as exc:  # the model is saved; only the hot swap failed
                        logger.exception("hot swap after training failed")
                        self._publish({"type": "error", "timestamp": _now(),
                                       "message": f"training finished but reloading the model failed: {exc}"})
            else:
                self.status.update(state="stopped", message="stopped by user; saved model unchanged",
                                   eta_seconds=None)
        except Exception as exc:
            logger.exception("training failed")
            detail = f"{type(exc).__name__}: {exc}".replace(str(config.REPO_ROOT), ".")  # no absolute paths
            self.status.update(state="failed", message="training failed", error=detail, eta_seconds=None)
            self._publish({"type": "error", "timestamp": _now(), "message": self.status["error"]})
        finally:
            self.status["finished_at"] = _now()
            self._publish({"type": "finished", "timestamp": _now(), "state": self.status["state"]})

    def _handle_event(self, event: dict) -> None:
        kind = event["type"]
        s = self.status
        if kind == "status":
            s["message"] = event["message"]
        elif kind == "train_begin":
            s.update(steps_per_epoch=event["steps_per_epoch"], message="training",
                     dataset={k: event[k] for k in ("n_train", "n_val", "n_test")})
        elif kind == "epoch_begin":
            s.update(epoch=event["epoch"], batch=0)
        elif kind == "batch":
            s["batch"] = event["batch"]
            s["latest"].update(batch_loss=event["loss"], batch_accuracy=event["accuracy"])
        elif kind == "epoch_end":
            for key in HISTORY_KEYS:
                s["history"][key].append(event[key])
            s["latest"].update({k: event[k] for k in HISTORY_KEYS})
            self._epoch_seconds.append(event["epoch_seconds"])
            if len(self._epoch_seconds) >= 2:  # one epoch is not a reliable estimate
                remaining = event["epochs"] - event["epoch"]
                s["eta_seconds"] = round(sum(self._epoch_seconds) / len(self._epoch_seconds) * remaining, 1)
        self._publish(event)

    # ------------------------------------------------------------ fan-out

    def _publish(self, event: dict) -> None:
        if event["type"] != "batch":
            self.events.append(event)
        for loop, queue in list(self._subscribers):
            try:
                loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError:  # the subscriber's loop is gone
                self._subscribers = [s for s in self._subscribers if s[1] is not queue]

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=10_000)
        self._subscribers.append((asyncio.get_running_loop(), queue))
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers = [s for s in self._subscribers if s[1] is not queue]
