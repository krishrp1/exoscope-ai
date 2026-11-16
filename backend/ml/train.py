"""Training for the ExoScope 1D CNN.

`train_model` is a plain function: it accepts an event callback (used by the
API to stream progress) and a stop flag (checked after every batch), so it can
run in a background thread as well as from the command line.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np

from . import config
from .evaluate import compute_metrics, save_plots
from .preprocessing import PreprocessConfig, Standardizer, build_dataset, load_processed, save_processed

EventCallback = Callable[[dict], None]


@dataclass
class TrainParams:
    epochs: int = 60
    batch_size: int = 64
    learning_rate: float = 1e-3
    dropout: float = 0.3
    early_stopping_patience: int = 10
    lr_patience: int = 4
    lr_factor: float = 0.5
    min_lr: float = 1e-5
    augment: bool = True
    noise_std: float = 0.05
    seed: int = config.SEED
    batch_event_every: int = 5

    def to_dict(self) -> dict:
        return asdict(self)


def compute_class_weights(y: np.ndarray, n_classes: int = 2) -> dict[int, float]:
    """Inverse-frequency ("balanced") class weights, from the training labels only."""
    counts = np.bincount(y, minlength=n_classes).astype(float)
    return {i: float(len(y) / (n_classes * c)) if c > 0 else 0.0 for i, c in enumerate(counts)}


def augment_batch(x: np.ndarray, rng: np.random.Generator, noise_std: float) -> np.ndarray:
    """Training-split-only augmentation: random time reversal of the folded views plus small noise.

    Reversing phase maps a transit onto a transit (they are close to
    symmetric), so the label is preserved. Never applied to val/test data.
    """
    out = x.copy()
    flip = rng.random(len(out)) < 0.5
    out[flip] = out[flip, ::-1, :]
    if noise_std > 0:
        out += rng.normal(0.0, noise_std, size=out.shape).astype(out.dtype)
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_processed_dataset(rebuild: bool = False) -> tuple[dict, PreprocessConfig]:
    """Load the cached processed dataset, building it from the raw light curves if needed."""
    if config.PROCESSED_PATH.exists() and not rebuild:
        return load_processed()
    cfg = PreprocessConfig()
    data = build_dataset(cfg)
    save_processed(data, cfg)
    return data, cfg


def train_model(params: TrainParams | None = None, event_cb: EventCallback | None = None,
                stop_flag: threading.Event | None = None, models_dir: Path | None = None,
                artifacts_dir: Path | None = None, dataset: tuple[dict, PreprocessConfig] | None = None) -> dict:
    """Train from scratch, evaluate on the held-out test split and save all artifacts.

    Returns a summary dict. If stopped through `stop_flag`, the run ends after
    the current batch, nothing is promoted, and the previously saved model (if
    any) stays untouched.
    """
    import keras

    from .model import build_model, describe_model

    params = params or TrainParams()
    models_dir = Path(models_dir or config.SAVED_MODELS_DIR)
    artifacts_dir = Path(artifacts_dir or config.ARTIFACTS_DIR)
    stop_flag = stop_flag or threading.Event()

    def emit(event_type: str, **payload) -> None:
        if event_cb:
            event_cb({"type": event_type, "timestamp": _now(), **payload})

    started = time.time()
    emit("status", message="loading dataset")
    data, pre_cfg = dataset or get_processed_dataset()
    x, y, split = data["x"], data["y"], data["split"]
    train_m, val_m, test_m = split == "train", split == "val", split == "test"
    for name, m in (("train", train_m), ("val", val_m), ("test", test_m)):
        if m.sum() == 0:
            raise RuntimeError(f"the {name} split is empty; not enough processed samples")

    # Leakage guards: no host star in more than one split; normalization fitted on train only.
    kep = data["kepid"]
    assert not (set(kep[train_m]) & set(kep[val_m])) and not (set(kep[train_m]) & set(kep[test_m])) \
        and not (set(kep[val_m]) & set(kep[test_m])), "a Kepler target appears in more than one split"
    standardizer = Standardizer().fit(x[train_m])
    x_train, x_val, x_test = (standardizer.transform(x[m]) for m in (train_m, val_m, test_m))
    y_train, y_val, y_test = y[train_m], y[val_m], y[test_m]
    class_weights = compute_class_weights(y_train)

    keras.utils.set_random_seed(params.seed)
    rng = np.random.default_rng(params.seed)
    model = build_model(input_shape=x.shape[1:], n_classes=len(config.CLASS_NAMES),
                        dropout=params.dropout, learning_rate=params.learning_rate)

    run_dir = artifacts_dir / "_run_in_progress"
    shutil.rmtree(run_dir, ignore_errors=True)
    run_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = run_dir / "model.keras"
    steps_per_epoch = int(np.ceil(len(x_train) / params.batch_size))

    class TrainingData(keras.utils.PyDataset):
        """Shuffles every epoch and applies augmentation to training batches only."""

        def __init__(self):
            super().__init__()
            self.order = rng.permutation(len(x_train))

        def __len__(self):
            return steps_per_epoch

        def __getitem__(self, i):
            idx = self.order[i * params.batch_size:(i + 1) * params.batch_size]
            xb = x_train[idx]
            if params.augment:
                xb = augment_batch(xb, rng, params.noise_std)
            weights = np.array([class_weights[int(c)] for c in y_train[idx]], dtype=np.float32)
            return xb, y_train[idx], weights

        def on_epoch_end(self):
            self.order = rng.permutation(len(x_train))

    class StreamCallback(keras.callbacks.Callback):
        def __init__(self):
            super().__init__()
            self.best_val_loss = np.inf
            self.epoch_started = 0.0
            self.stopped_by_user = False

        def on_train_begin(self, logs=None):
            emit("train_begin", epochs=params.epochs, steps_per_epoch=steps_per_epoch,
                 n_train=int(len(x_train)), n_val=int(len(x_val)), n_test=int(len(x_test)),
                 class_weights={config.CLASS_NAMES[k]: v for k, v in class_weights.items()},
                 params=params.to_dict())

        def on_epoch_begin(self, epoch, logs=None):
            self.epoch_started = time.time()
            emit("epoch_begin", epoch=epoch + 1, epochs=params.epochs)

        def on_train_batch_end(self, batch, logs=None):
            if stop_flag.is_set():
                self.stopped_by_user = True
                self.model.stop_training = True
            if (batch + 1) % params.batch_event_every == 0 or batch + 1 == steps_per_epoch:
                logs = logs or {}
                emit("batch", batch=batch + 1, steps_per_epoch=steps_per_epoch,
                     loss=float(logs.get("loss", np.nan)), accuracy=float(logs.get("accuracy", np.nan)))

        def on_epoch_end(self, epoch, logs=None):
            logs = logs or {}
            if self.stopped_by_user and "val_loss" not in logs:
                return
            lr = float(keras.ops.convert_to_numpy(self.model.optimizer.learning_rate))
            emit("epoch_end", epoch=epoch + 1, epochs=params.epochs,
                 loss=float(logs.get("loss", np.nan)), accuracy=float(logs.get("accuracy", np.nan)),
                 val_loss=float(logs.get("val_loss", np.nan)), val_accuracy=float(logs.get("val_accuracy", np.nan)),
                 learning_rate=lr, epoch_seconds=round(time.time() - self.epoch_started, 3))
            val_loss = logs.get("val_loss")
            if val_loss is not None and val_loss < self.best_val_loss:
                self.best_val_loss = float(val_loss)
                emit("checkpoint_saved", epoch=epoch + 1, val_loss=float(val_loss))

    stream = StreamCallback()
    callbacks = [
        keras.callbacks.ModelCheckpoint(str(checkpoint_path), monitor="val_loss", save_best_only=True),
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=params.early_stopping_patience,
                                      restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=params.lr_factor,
                                          patience=params.lr_patience, min_lr=params.min_lr),
        stream,  # after ReduceLROnPlateau so the reported learning rate is the updated one
    ]
    # Learning rate per epoch is recorded by ReduceLROnPlateau into history as "learning_rate".
    fit = model.fit(TrainingData(), validation_data=(x_val, y_val), epochs=params.epochs,
                    callbacks=callbacks, verbose=0)
    history = {k: [float(v) for v in vals] for k, vals in fit.history.items()}
    epochs_run = len(history.get("loss", []))

    if stream.stopped_by_user:
        shutil.rmtree(run_dir, ignore_errors=True)
        emit("stopped", epochs_completed=epochs_run, message="stopped by user; the saved model was not replaced")
        return {"status": "stopped", "epochs_completed": epochs_run, "history": history,
                "duration_seconds": round(time.time() - started, 2)}

    emit("status", message="evaluating on the held-out test set")
    best = keras.models.load_model(checkpoint_path)
    val_metrics = compute_metrics(y_val, best.predict(x_val, verbose=0), config.CLASS_NAMES)
    test_probs = best.predict(x_test, verbose=0)
    test_metrics = compute_metrics(y_test, test_probs, config.CLASS_NAMES)
    best_epoch = int(np.argmin(history["val_loss"])) + 1
    finished_at = _now()

    def split_counts(m: np.ndarray) -> dict:
        return {"n_samples": int(m.sum()), "n_targets": int(len(np.unique(kep[m]))),
                **{config.CLASS_NAMES[i]: int((y[m] == i).sum()) for i in range(len(config.CLASS_NAMES))}}

    metrics = {
        "trained_at": finished_at,
        "duration_seconds": round(time.time() - started, 2),
        "epochs_run": epochs_run,
        "best_epoch": best_epoch,
        "early_stopped": epochs_run < params.epochs,
        "splits": {"train": split_counts(train_m), "val": split_counts(val_m), "test": split_counts(test_m)},
        "class_weights": {config.CLASS_NAMES[k]: v for k, v in class_weights.items()},
        "test": test_metrics,
        "validation": {k: v for k, v in val_metrics.items() if k not in ("roc_curve", "pr_curve")},
        "provenance": {"labels": config.PROVENANCE_KAGGLE, "light_curves": config.PROVENANCE_MAST},
    }
    plots = save_plots(history, test_metrics, run_dir / "plots")

    def dump(name: str, obj) -> None:
        (run_dir / name).write_text(json.dumps(obj, indent=2))

    dump("metrics.json", metrics)
    dump("training_history.json", {"history": history, "epochs_run": epochs_run, "best_epoch": best_epoch,
                                   "params": params.to_dict(), "trained_at": finished_at})
    dump("model_config.json", {**describe_model(best), "train_params": params.to_dict(),
                               "class_names": config.CLASS_NAMES, "plots": plots})
    dump("preprocessing_config.json", {"preprocess": pre_cfg.to_dict(), "standardizer": standardizer.to_dict(),
                                       "standardizer_fitted_on": "training split only"})
    dump("label_mapping.json", {"index_to_class": {str(i): n for i, n in enumerate(config.CLASS_NAMES)},
                                "source_column": config.LABEL_COLUMN, "positive_class": config.POSITIVE_CLASS,
                                "excluded": {config.UNLABELED_CLASS: "unresolved disposition; not used for training or evaluation"}})
    import pandas as pd
    pd.DataFrame({"kepoi_name": data["kepoi_name"][test_m], "kepid": kep[test_m], "y_true": y_test,
                  "prob_false_positive": test_probs[:, 0], "prob_confirmed": test_probs[:, 1]}
                 ).to_csv(run_dir / "test_predictions.csv", index=False)

    # Promote: the model file first, then the artifacts that describe it.
    models_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(checkpoint_path, models_dir / "model.keras.tmp")
    (models_dir / "model.keras.tmp").replace(models_dir / "model.keras")
    for name in ("model_config.json", "preprocessing_config.json", "label_mapping.json"):
        shutil.copy2(run_dir / name, models_dir / name)
    for name in ("metrics.json", "training_history.json", "test_predictions.csv"):
        shutil.copy2(run_dir / name, artifacts_dir / name)
    shutil.rmtree(artifacts_dir / "plots", ignore_errors=True)
    shutil.copytree(run_dir / "plots", artifacts_dir / "plots")
    shutil.rmtree(run_dir, ignore_errors=True)

    emit("completed", epochs_run=epochs_run, best_epoch=best_epoch,
         test={k: test_metrics[k] for k in ("accuracy", "precision", "recall", "f1", "roc_auc", "pr_auc")})
    return {"status": "completed", "epochs_run": epochs_run, "best_epoch": best_epoch, "history": history,
            "metrics": metrics, "duration_seconds": metrics["duration_seconds"]}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train the ExoScope 1D CNN from scratch.")
    parser.add_argument("--epochs", type=int, default=TrainParams.epochs)
    parser.add_argument("--batch-size", type=int, default=TrainParams.batch_size)
    parser.add_argument("--learning-rate", type=float, default=TrainParams.learning_rate)
    parser.add_argument("--rebuild-dataset", action="store_true")
    args = parser.parse_args()

    def _print(event: dict) -> None:
        if event["type"] != "batch":
            print(json.dumps(event), flush=True)

    ds = get_processed_dataset(rebuild=args.rebuild_dataset)
    result = train_model(TrainParams(epochs=args.epochs, batch_size=args.batch_size,
                                     learning_rate=args.learning_rate), event_cb=_print, dataset=ds)
    if result["status"] == "completed":
        t = result["metrics"]["test"]
        print("TEST", {k: t[k] for k in ("n_samples", "n_positive", "accuracy", "precision", "recall",
                                         "f1", "roc_auc", "pr_auc")})
        print("confusion matrix", t["confusion_matrix"]["matrix"])
