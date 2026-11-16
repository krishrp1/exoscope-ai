"""Evaluation on a held-out split. Every number is computed from model outputs."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sklearn.metrics import (accuracy_score, average_precision_score, confusion_matrix,
                             precision_recall_curve, precision_recall_fscore_support, roc_auc_score, roc_curve)

from . import config


def _thin(*arrays: np.ndarray, max_points: int = 300) -> list[list[float]]:
    """Subsample curve points for storage/plotting (keeps first and last)."""
    n = len(arrays[0])
    idx = np.arange(n) if n <= max_points else np.unique(np.linspace(0, n - 1, max_points).round().astype(int))
    return [np.asarray(a, dtype=float)[idx].tolist() for a in arrays]


def compute_metrics(y_true: np.ndarray, probs: np.ndarray, class_names: list[str] | None = None) -> dict:
    """Metrics for a binary problem. `probs` is (N, 2) softmax output; class 1 is the positive class."""
    class_names = class_names or config.CLASS_NAMES
    y_true = np.asarray(y_true).astype(int)
    score = np.asarray(probs)[:, 1]
    y_pred = np.asarray(probs).argmax(axis=1)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    prec, rec, f1, support = precision_recall_fscore_support(y_true, y_pred, labels=[0, 1], zero_division=0)
    has_both = len(np.unique(y_true)) == 2
    metrics = {
        "n_samples": int(len(y_true)),
        "n_positive": int((y_true == 1).sum()),
        "n_negative": int((y_true == 0).sum()),
        "positive_class": class_names[1],
        "positive_prevalence": float((y_true == 1).mean()),
        "decision_rule": "argmax of softmax (equivalent to a 0.5 threshold); not tuned on the test set",
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(prec[1]),
        "recall": float(rec[1]),
        "f1": float(f1[1]),
        "roc_auc": float(roc_auc_score(y_true, score)) if has_both else None,
        "pr_auc": float(average_precision_score(y_true, score)) if has_both else None,
        "confusion_matrix": {"labels": class_names, "matrix": cm.tolist(),
                             "layout": "rows = true class, columns = predicted class"},
        "per_class": {class_names[i]: {"precision": float(prec[i]), "recall": float(rec[i]),
                                       "f1": float(f1[i]), "support": int(support[i])} for i in (0, 1)},
    }
    if has_both:
        fpr, tpr, _ = roc_curve(y_true, score)
        p, r, _ = precision_recall_curve(y_true, score)
        metrics["roc_curve"] = dict(zip(("fpr", "tpr"), _thin(fpr, tpr)))
        metrics["pr_curve"] = dict(zip(("recall", "precision"), _thin(r, p)))
    return metrics


def save_plots(history: dict, test_metrics: dict, out_dir: Path) -> dict[str, str]:
    """Write accuracy/loss curves, ROC, PR and confusion-matrix PNGs. Returns {name: filename}."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out_dir.mkdir(parents=True, exist_ok=True)
    files: dict[str, str] = {}
    epochs = np.arange(1, len(history.get("loss", [])) + 1)

    def _save(fig, name: str) -> None:
        fig.tight_layout()
        fig.savefig(out_dir / f"{name}.png", dpi=130)
        plt.close(fig)
        files[name] = f"{name}.png"

    for key, title in (("accuracy", "Accuracy"), ("loss", "Loss")):
        if key in history:
            fig, ax = plt.subplots(figsize=(6, 4))
            ax.plot(epochs, history[key], label=f"train {key}")
            if f"val_{key}" in history:
                ax.plot(epochs, history[f"val_{key}"], label=f"validation {key}")
            ax.set(xlabel="epoch", ylabel=key, title=f"{title} per epoch")
            ax.legend()
            _save(fig, f"{key}_curve")

    if "roc_curve" in test_metrics:
        fig, ax = plt.subplots(figsize=(5, 5))
        ax.plot(test_metrics["roc_curve"]["fpr"], test_metrics["roc_curve"]["tpr"],
                label=f"ROC-AUC = {test_metrics['roc_auc']:.3f}")
        ax.plot([0, 1], [0, 1], "--", color="grey", label="chance")
        ax.set(xlabel="false positive rate", ylabel="true positive rate", title="ROC curve (test set)")
        ax.legend()
        _save(fig, "roc_curve")
        fig, ax = plt.subplots(figsize=(5, 5))
        ax.plot(test_metrics["pr_curve"]["recall"], test_metrics["pr_curve"]["precision"],
                label=f"PR-AUC = {test_metrics['pr_auc']:.3f}")
        ax.axhline(test_metrics["positive_prevalence"], ls="--", color="grey", label="prevalence")
        ax.set(xlabel="recall", ylabel="precision", title="Precision-recall curve (test set)")
        ax.legend()
        _save(fig, "pr_curve")

    cm = np.asarray(test_metrics["confusion_matrix"]["matrix"])
    labels = test_metrics["confusion_matrix"]["labels"]
    fig, ax = plt.subplots(figsize=(5, 4.5))
    im = ax.imshow(cm, cmap="Blues")
    ax.set(xticks=[0, 1], yticks=[0, 1], xticklabels=labels, yticklabels=labels,
           xlabel="predicted", ylabel="true", title="Confusion matrix (test set)")
    for (i, j), v in np.ndenumerate(cm):
        ax.text(j, i, str(v), ha="center", va="center", color="white" if v > cm.max() / 2 else "black")
    fig.colorbar(im, ax=ax)
    _save(fig, "confusion_matrix")
    return files


def evaluate_saved_model(models_dir: Path | None = None, artifacts_dir: Path | None = None) -> dict:
    """Re-run test-set evaluation from the saved model and saved preprocessing config.

    Independent of the training run: loads the model from disk, rebuilds the
    test split from the processed dataset, and recomputes every metric.
    """
    from .predict import Predictor
    from .preprocessing import load_processed

    predictor = Predictor.load(models_dir, artifacts_dir)
    data, _ = load_processed()
    mask = data["split"] == "test"
    probs = predictor.predict_views(data["x"][mask])
    return compute_metrics(data["y"][mask], probs, predictor.class_names)


if __name__ == "__main__":
    fresh = evaluate_saved_model()
    saved = json.loads((config.ARTIFACTS_DIR / "metrics.json").read_text())["test"]
    for key in ("n_samples", "n_positive", "accuracy", "precision", "recall", "f1", "roc_auc", "pr_auc"):
        print(f"{key:12s} recomputed={fresh[key]!r:24} saved={saved[key]!r}")
    print("confusion matrix recomputed:", fresh["confusion_matrix"]["matrix"],
          "saved:", saved["confusion_matrix"]["matrix"])
    mismatched = [k for k in ("accuracy", "precision", "recall", "f1", "roc_auc", "pr_auc")
                  if abs(fresh[k] - saved[k]) > 1e-6]
    if mismatched or fresh["confusion_matrix"]["matrix"] != saved["confusion_matrix"]["matrix"]:
        raise SystemExit(f"MISMATCH between saved metrics and recomputation: {mismatched or 'confusion matrix'}")
    print("OK: saved metrics match the recomputation from the saved model")
