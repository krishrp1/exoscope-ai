"""Model explanations: saliency, Integrated Gradients and occlusion.

These describe which parts of the *model input* moved the *model output*.
They are explanations of the network, not physical detections of a transit.

All functions take one standardized input of shape (n_bins, 2) and return an
attribution array of the same shape for the requested class.
"""
from __future__ import annotations

import numpy as np
import tensorflow as tf

METHODS = {
    "saliency": "Saliency (absolute gradient of the class score with respect to the input)",
    "integrated_gradients": "Integrated Gradients (path integral from a flat, no-transit baseline)",
    "occlusion": "Occlusion (drop in class score when a window is replaced by the flat baseline)",
}


def _as_batch(x: np.ndarray) -> tf.Tensor:
    x = np.asarray(x, dtype=np.float32)
    if x.ndim != 2:
        raise ValueError(f"expected one input of shape (n_bins, channels), got {x.shape}")
    return tf.convert_to_tensor(x[None, ...])


def saliency(model, x: np.ndarray, class_index: int) -> np.ndarray:
    xb = _as_batch(x)
    with tf.GradientTape() as tape:
        tape.watch(xb)
        score = model(xb, training=False)[:, class_index]
    return np.abs(tape.gradient(score, xb).numpy()[0])


def integrated_gradients(model, x: np.ndarray, baseline: np.ndarray, class_index: int,
                         steps: int = 64) -> np.ndarray:
    """Riemann (trapezoid) approximation of Integrated Gradients (Sundararajan et al. 2017).

    Completeness: the attributions sum to roughly score(x) - score(baseline).
    """
    x = np.asarray(x, dtype=np.float32)
    baseline = np.broadcast_to(np.asarray(baseline, dtype=np.float32), x.shape)
    alphas = np.linspace(0.0, 1.0, steps + 1, dtype=np.float32)[:, None, None]
    path = tf.convert_to_tensor(baseline[None] + alphas * (x - baseline)[None])
    with tf.GradientTape() as tape:
        tape.watch(path)
        scores = model(path, training=False)[:, class_index]
    grads = tape.gradient(scores, path).numpy()
    avg = (grads[:-1] + grads[1:]).mean(axis=0) / 2.0
    return (x - baseline) * avg


def occlusion(model, x: np.ndarray, baseline: np.ndarray, class_index: int,
              window: int = 16, stride: int = 8) -> np.ndarray:
    """Per-channel sliding-window occlusion. Positive = the window supported the class."""
    x = np.asarray(x, dtype=np.float32)
    baseline = np.broadcast_to(np.asarray(baseline, dtype=np.float32), x.shape)
    n, channels = x.shape
    starts = list(range(0, max(n - window, 0) + 1, stride))
    if starts[-1] + window < n:
        starts.append(n - window)
    batch, spans = [x], []
    for c in range(channels):
        for s in starts:
            occluded = x.copy()
            occluded[s:s + window, c] = baseline[s:s + window, c]
            batch.append(occluded)
            spans.append((s, c))
    scores = model(tf.convert_to_tensor(np.stack(batch)), training=False).numpy()[:, class_index]
    drop = scores[0] - scores[1:]
    total = np.zeros_like(x, dtype=np.float64)
    count = np.zeros_like(x, dtype=np.float64)
    for (s, c), d in zip(spans, drop):
        total[s:s + window, c] += d
        count[s:s + window, c] += 1
    return (total / np.maximum(count, 1)).astype(np.float32)


def explain(model, x: np.ndarray, baseline: np.ndarray, class_index: int,
            methods: list[str] | None = None) -> dict[str, dict]:
    """Run the requested methods. Returns {method: {label, attribution (n_bins, 2) list}}."""
    out: dict[str, dict] = {}
    for name in methods or list(METHODS):
        if name not in METHODS:
            raise ValueError(f"unknown explanation method '{name}'; available: {sorted(METHODS)}")
        if name == "saliency":
            attr = saliency(model, x, class_index)
        elif name == "integrated_gradients":
            attr = integrated_gradients(model, x, baseline, class_index)
        else:
            attr = occlusion(model, x, baseline, class_index)
        out[name] = {"label": METHODS[name], "attribution": attr}
    return out
