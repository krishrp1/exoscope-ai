import json
import threading

import numpy as np
import pytest

from backend.ml import config
from backend.ml.evaluate import compute_metrics
from backend.ml.model import build_model
from backend.ml.predict import ModelNotTrainedError, Predictor
from backend.ml.train import TrainParams, augment_batch, compute_class_weights, train_model
from backend.tests.conftest import make_synthetic_curve


def test_model_shapes_and_architecture():
    model = build_model(input_shape=(256, 2), n_classes=2)
    assert model.input_shape == (None, 256, 2) and model.output_shape == (None, 2)
    kinds = [layer.__class__.__name__ for layer in model.layers]
    assert kinds == ["InputLayer", "Conv1D", "BatchNormalization", "ReLU", "MaxPooling1D",
                     "Conv1D", "BatchNormalization", "ReLU", "MaxPooling1D",
                     "Conv1D", "BatchNormalization", "ReLU", "GlobalAveragePooling1D",
                     "Dense", "Dropout", "Dense"]
    assert [l.filters for l in model.layers if l.__class__.__name__ == "Conv1D"] == [32, 64, 128]
    probs = np.asarray(model(np.zeros((3, 256, 2), dtype=np.float32)))
    assert np.allclose(probs.sum(axis=1), 1.0, atol=1e-5)


def test_class_weights_are_inverse_frequency():
    w = compute_class_weights(np.array([0, 0, 0, 1]))
    assert w[0] == pytest.approx(4 / 6) and w[1] == pytest.approx(2.0)


def test_augmentation_leaves_input_untouched_and_keeps_shape():
    x = np.random.default_rng(0).normal(size=(8, 32, 2)).astype(np.float32)
    before = x.copy()
    out = augment_batch(x, np.random.default_rng(1), 0.05)
    assert np.array_equal(x, before) and out.shape == x.shape and not np.array_equal(out, x)


def test_compute_metrics_matches_hand_count():
    y = np.array([1, 1, 1, 0, 0, 0, 0, 0])
    probs = np.array([[.1, .9], [.2, .8], [.7, .3], [.4, .6], [.9, .1], [.8, .2], [.7, .3], [.6, .4]])
    m = compute_metrics(y, probs)
    assert m["confusion_matrix"]["matrix"] == [[4, 1], [1, 2]]
    assert m["precision"] == pytest.approx(2 / 3) and m["recall"] == pytest.approx(2 / 3)
    assert m["accuracy"] == pytest.approx(6 / 8)
    assert m["n_positive"] == 3 and 0 <= m["pr_auc"] <= 1


def test_training_saves_all_artifacts(trained):
    assert trained["result"]["status"] == "completed"
    models, artifacts = trained["models_dir"], trained["artifacts_dir"]
    for name in ("model.keras", "model_config.json", "preprocessing_config.json", "label_mapping.json"):
        assert (models / name).exists(), name
    for name in ("metrics.json", "training_history.json", "test_predictions.csv",
                 "plots/accuracy_curve.png", "plots/loss_curve.png", "plots/roc_curve.png", "plots/pr_curve.png",
                 "plots/confusion_matrix.png"):
        assert (artifacts / name).exists(), name
    assert not (artifacts / "_run_in_progress").exists()


def test_training_emits_real_events(trained):
    types = [e["type"] for e in trained["events"]]
    assert types[0] == "status" and "train_begin" in types and types[-1] == "completed"
    epochs = [e for e in trained["events"] if e["type"] == "epoch_end"]
    history = trained["result"]["history"]
    assert [e["loss"] for e in epochs] == pytest.approx(history["loss"])
    assert [e["val_loss"] for e in epochs] == pytest.approx(history["val_loss"])
    assert all(e["learning_rate"] > 0 for e in epochs)
    assert any(e["type"] == "batch" for e in trained["events"])


def test_standardizer_was_fitted_on_training_split_only(trained):
    data, _ = trained["dataset"]
    saved = json.loads((trained["models_dir"] / "preprocessing_config.json").read_text())["standardizer"]
    train_x = data["x"][data["split"] == "train"]
    assert np.allclose(saved["mean"], train_x.mean(axis=(0, 1)), atol=1e-5)
    assert saved["n_fit_samples"] == len(train_x)
    assert not np.allclose(saved["mean"], data["x"].mean(axis=(0, 1)), atol=1e-7)


def test_saved_metrics_match_recomputation_from_saved_model(trained):
    data, _ = trained["dataset"]
    predictor = Predictor.load(trained["models_dir"])
    mask = data["split"] == "test"
    fresh = compute_metrics(data["y"][mask], predictor.predict_views(data["x"][mask]))
    saved = json.loads((trained["artifacts_dir"] / "metrics.json").read_text())["test"]
    assert fresh["confusion_matrix"] == saved["confusion_matrix"]
    for key in ("accuracy", "precision", "recall", "f1"):
        assert fresh[key] == pytest.approx(saved[key], abs=1e-6)


def test_saved_model_reloads_and_reproduces_predictions(trained):
    data, _ = trained["dataset"]
    a = Predictor.load(trained["models_dir"]).predict_views(data["x"])
    b = Predictor.load(trained["models_dir"]).predict_views(data["x"])
    assert np.allclose(a, b, atol=1e-6)
    assert np.allclose(a.sum(axis=1), 1.0, atol=1e-5)


def test_predict_full_path(trained):
    predictor = Predictor.load(trained["models_dir"])
    time, flux = make_synthetic_curve(seed=99)
    out = predictor.predict(flux, time=time, period=3.2, t0=1.1, duration_hours=3.0)
    assert out["predicted_class"] in config.CLASS_NAMES
    assert sum(out["probabilities"].values()) == pytest.approx(1.0, abs=1e-5)
    assert out["ephemeris"]["source"] == "provided"
    assert list(out["processing"]["stages_ms"]) == ["loading", "validating", "normalizing",
                                                    "extracting_features", "cnn_inference", "preparing_results"]
    assert len(out["processed"]["global_view"]["flux"]) == 256
    assert set(out["explanation"]["methods"]) == {"saliency", "integrated_gradients", "occlusion"}
    again = predictor.predict(flux, time=time, period=3.2, t0=1.1, duration_hours=3.0)
    assert again["probabilities"] == out["probabilities"]


def test_predict_estimates_ephemeris_when_missing(trained):
    predictor = Predictor.load(trained["models_dir"])
    time, flux = make_synthetic_curve(period=4.7, depth=0.006, n_days=90.0, seed=5)
    out = predictor.predict(flux, time=time, with_explanation=False)
    assert out["ephemeris"]["source"] == "estimated"
    assert "explanation" not in out


def test_predictor_without_model_raises(tmp_path):
    with pytest.raises(ModelNotTrainedError):
        Predictor.load(tmp_path)


def test_stop_flag_stops_training_without_replacing_model(tiny_dataset, tmp_path):
    stop = threading.Event()
    events = []

    def on_event(event):
        events.append(event)
        if event["type"] == "batch":
            stop.set()

    result = train_model(TrainParams(epochs=50, batch_size=8, batch_event_every=1), event_cb=on_event,
                         stop_flag=stop, models_dir=tmp_path / "m", artifacts_dir=tmp_path / "a",
                         dataset=tiny_dataset)
    assert result["status"] == "stopped" and result["epochs_completed"] <= 1
    assert events[-1]["type"] == "stopped"
    assert not (tmp_path / "m" / "model.keras").exists()
