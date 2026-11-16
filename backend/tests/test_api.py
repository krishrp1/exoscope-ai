"""API tests against a small SYNTHETIC fixture dataset (never used for the shipped model)."""
from __future__ import annotations

import io
import time

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.ml import config
from backend.ml import dataset as ds
from backend.ml import predict as predict_mod
from backend.ml.preprocessing import PreprocessConfig, build_dataset, save_processed
from backend.ml.train import TrainParams, train_model
from backend.tests.conftest import make_synthetic_curve

N_STARS = 30


def _fake_koi_table() -> pd.DataFrame:
    rows = []
    for i in range(N_STARS):
        label = "CONFIRMED" if i % 3 == 0 else "FALSE POSITIVE"
        if i >= N_STARS - 2:
            label = "CANDIDATE"
        rows.append({"kepid": 5000 + i, "kepoi_name": f"K{9000 + i:05d}.01",
                     "kepler_name": f"Synthetic-{i} b" if label == "CONFIRMED" else None,
                     "koi_disposition": label, "koi_pdisposition": "CANDIDATE", "koi_score": 0.5,
                     "koi_period": 2.0 + 0.13 * i, "koi_time0bk": 1.1, "koi_duration": 3.0,
                     "koi_depth": 4000.0 if label != "FALSE POSITIVE" else 300.0, "koi_prad": 2.0,
                     "koi_model_snr": 30.0, "koi_kepmag": 14.0, "koi_teq": 800.0, "koi_steff": 5500.0,
                     "ra": 290.0 + i, "dec": 45.0})
    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    root = tmp_path_factory.mktemp("api")
    mp = pytest.MonkeyPatch()
    mp.setattr(config, "DATA_DIR", root / "data")
    mp.setattr(config, "LIGHTCURVE_DIR", root / "data" / "lightcurves")
    mp.setattr(config, "MANIFEST_PATH", root / "data" / "lightcurve_manifest.csv")
    mp.setattr(config, "PROCESSED_PATH", root / "data" / "processed_views.npz")
    mp.setattr(config, "SAVED_MODELS_DIR", root / "models")
    mp.setattr(config, "ARTIFACTS_DIR", root / "artifacts")
    koi = _fake_koi_table()
    mp.setattr(ds, "_load_koi_table_cached", lambda: koi)

    config.LIGHTCURVE_DIR.mkdir(parents=True)
    manifest = []
    for row in koi.itertuples():
        depth = 0.004 if row.koi_disposition != "FALSE POSITIVE" else 0.0003
        t, f = make_synthetic_curve(period=row.koi_period, depth=depth, n_days=60.0, seed=row.kepid)
        np.savez_compressed(ds.lightcurve_path(row.kepid), time=t, flux=f.astype(np.float32),
                            quarter=np.zeros(len(t), dtype=np.int8))
        manifest.append({"kepid": row.kepid, "status": "ok", "n_quarters": 1, "n_points": len(t),
                         "t_start": t[0], "t_end": t[-1], "error": ""})
    pd.DataFrame(manifest).to_csv(config.MANIFEST_PATH, index=False)
    cfg = PreprocessConfig()
    data = build_dataset(cfg)
    save_processed(data, cfg)
    result = train_model(TrainParams(epochs=2, batch_size=8), dataset=(data, cfg))
    assert result["status"] == "completed"

    from backend.api.state import state
    from backend.api.training_manager import TrainingManager
    from backend.main import app

    state.training = TrainingManager(on_completed=state.reload_after_training)
    state.recent_predictions.clear()
    with TestClient(app) as c:
        yield c
    if state.training.is_running():
        state.training.stop()
        state.training.wait(30)
    predict_mod._predictor = None
    mp.undo()


def _csv(time_arr, flux_arr, header="time,flux") -> bytes:
    lines = [header] + [f"{t:.6f},{f:.4f}" for t, f in zip(time_arr, flux_arr)]
    return "\n".join(lines).encode()


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["model_loaded"] is True and body["n_samples"] == N_STARS


def test_dataset_stats(client):
    body = client.get("/api/dataset/stats").json()
    assert body["catalog"]["n_koi"] == N_STARS
    assert body["catalog"]["class_counts"]["CANDIDATE"] == 2
    assert body["light_curves"]["n_koi_available"] == N_STARS
    splits = body["splits"]
    assert splits["train"]["n_samples"] + splits["val"]["n_samples"] + splits["test"]["n_samples"] == N_STARS - 2
    assert splits["unlabeled"]["n_samples"] == 2
    assert body["synthetic_data_used"] is False


def test_samples_listing_filter_sort_paginate(client):
    body = client.get("/api/dataset/samples", params={"page_size": 10}).json()
    assert body["total"] == N_STARS and len(body["items"]) == 10 and body["pages"] == 3
    confirmed = client.get("/api/dataset/samples", params={"disposition": "confirmed", "page_size": 200}).json()
    assert confirmed["total"] > 0 and all(i["koi_disposition"] == "CONFIRMED" for i in confirmed["items"])
    desc = client.get("/api/dataset/samples", params={"sort": "koi_period", "order": "desc"}).json()["items"]
    assert [i["koi_period"] for i in desc] == sorted((i["koi_period"] for i in desc), reverse=True)
    assert client.get("/api/dataset/samples", params={"search": "K09003"}).json()["total"] == 1
    assert client.get("/api/dataset/samples", params={"search": "zzz"}).json()["total"] == 0
    bad = client.get("/api/dataset/samples", params={"sort": "nope"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_sort"


def test_sample_detail_raw_and_normalized(client):
    raw = client.get("/api/dataset/samples/K09000.01", params={"max_points": 500}).json()
    assert raw["lightcurve"]["mode"] == "raw" and raw["lightcurve"]["n_returned"] <= 500
    assert raw["lightcurve"]["decimated"] is True
    assert raw["metadata"]["observation_count"] == raw["lightcurve"]["n_total"]
    assert len(raw["views"]["global_view"]["flux"]) == 256
    assert raw["transits"]["n_total"] > 5
    norm = client.get("/api/dataset/samples/K09000.01", params={"mode": "normalized", "max_points": 0}).json()
    assert abs(np.median(norm["lightcurve"]["flux"]) - 1.0) < 0.01
    missing = client.get("/api/dataset/samples/NOPE")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "sample_not_found"


def test_model_status_and_metrics(client):
    status = client.get("/api/model/status").json()
    assert status["trained"] is True and status["class_names"] == ["FALSE POSITIVE", "CONFIRMED"]
    assert status["architecture"]["input_shape"] == [256, 2]
    metrics = client.get("/api/model/metrics").json()
    assert metrics["trained"] is True and "confusion_matrix" in metrics["metrics"]["test"]
    assert "confusion_matrix.png" in metrics["plots"]
    plot = client.get("/api/model/plots/confusion_matrix.png")
    assert plot.status_code == 200 and plot.headers["content-type"] == "image/png"
    assert client.get("/api/model/plots/../../secrets.png").status_code == 404


def test_predict_dataset_sample(client):
    r = client.post("/api/predict", json={"sample_id": "K09000.01"})
    assert r.status_code == 200
    body = r.json()
    assert body["predicted_class"] in ("FALSE POSITIVE", "CONFIRMED")
    assert abs(sum(body["probabilities"].values()) - 1) < 1e-5
    assert body["source"]["dataset_label"] == "CONFIRMED" and body["ephemeris"]["source"] == "Kaggle KOI catalog"
    assert set(body["explanation"]["methods"]) == {"saliency", "integrated_gradients", "occlusion"}
    assert all(v >= 0 for v in body["processing"]["stages_ms"].values())
    assert "not the probability" in body["disclaimer"]
    recent = client.get("/api/predictions/recent").json()["items"]
    assert recent[0]["name"] == "K09000.01"


def test_predict_inline_and_validation(client):
    t, f = make_synthetic_curve(seed=3, n_days=60.0)
    r = client.post("/api/predict", json={"time": t.tolist(), "flux": f.tolist(), "period": 3.2, "t0": 1.1,
                                          "duration_hours": 3.0, "explain": False})
    assert r.status_code == 200 and "explanation" not in r.json()
    assert client.post("/api/predict", json={}).status_code == 422
    assert client.post("/api/predict", json={"sample_id": "a", "flux": [1, 2]}).status_code == 422
    short = client.post("/api/predict", json={"flux": [1.0] * 20, "period": 1.0, "t0": 0.0, "duration_hours": 2.0})
    assert short.status_code == 422 and short.json()["error"]["code"] == "cannot_process"
    unknown = client.post("/api/predict", json={"sample_id": "NOPE"})
    assert unknown.status_code == 404


def test_upload_happy_path_with_and_without_ephemeris(client):
    t, f = make_synthetic_curve(period=4.7, depth=0.006, n_days=90.0, seed=11)
    content = _csv(t, f)
    insp = client.post("/api/predict/upload/inspect", files={"file": ("lc.csv", content, "text/csv")}).json()
    assert insp["suggested_mapping"] == {"time": "time", "flux": "flux"} and insp["n_rows"] == len(t)
    r = client.post("/api/predict/upload", files={"file": ("lc.csv", content, "text/csv")},
                    data={"period": "4.7", "t0": "1.1", "duration_hours": "3.0"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ephemeris"]["source"] == "provided" and body["upload"]["flux_column"] == "flux"
    est = client.post("/api/predict/upload", files={"file": ("lc.csv", content, "text/csv")})
    assert est.status_code == 200 and est.json()["ephemeris"]["source"] == "estimated"


def test_upload_custom_columns_and_missing_values(client):
    t, f = make_synthetic_curve(seed=12, n_days=60.0)
    lines = ["# exported light curve", "BJD;brightness;flag"]
    for i, (a, b) in enumerate(zip(t, f)):
        lines.append(f"{a:.6f};{'' if i % 50 == 0 else f'{b:.4f}'};0")
    r = client.post("/api/predict/upload", files={"file": ("lc.txt", "\n".join(lines).encode(), "text/plain")},
                    data={"time_column": "BJD", "flux_column": "brightness", "period": "3.2", "t0": "1.1",
                          "duration_hours": "3.0"})
    assert r.status_code == 200, r.text
    assert r.json()["upload"]["n_rows_with_missing_values"] == len(range(0, len(t), 50))


@pytest.mark.parametrize("name,content,ctype,status,code", [
    ("lc.png", b"\x89PNG\r\n", "image/png", 415, "unsupported_file_type"),
    ("lc.csv", b"time,flux\n1,2\n", "application/json", 415, "unsupported_content_type"),
    ("lc.csv", b"", "text/csv", 400, "empty_file"),
    ("lc.csv", b"\x00\x01\x02\x03binary", "text/csv", 400, "not_text"),
    ("lc.csv", b"name,comment\nfoo,bar\nbaz,qux\n", "text/csv", 422, "flux_column_required"),
    ("lc.csv", b"time,flux\n" + b"1,2\n" * 30, "text/csv", 422, "cannot_process"),
])
def test_upload_rejections(client, name, content, ctype, status, code):
    r = client.post("/api/predict/upload", files={"file": (name, content, ctype)})
    assert r.status_code == status, r.text
    assert r.json()["error"]["code"] == code


def test_upload_unknown_column_and_oversize(client, monkeypatch):
    r = client.post("/api/predict/upload", files={"file": ("lc.csv", b"time,flux\n1,2\n2,3\n", "text/csv")},
                    data={"flux_column": "nope"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "unknown_column"
    from backend.api.settings import get_settings
    monkeypatch.setattr(get_settings(), "max_upload_mb", 0.001)
    big = client.post("/api/predict/upload", files={"file": ("lc.csv", b"time,flux\n" + b"1.0,2.0\n" * 500, "text/csv")})
    assert big.status_code == 413 and big.json()["error"]["code"] == "file_too_large"


def test_uploaded_content_is_never_executed(client, tmp_path):
    marker = tmp_path / "pwned"
    payload = f"time,flux\n__import__('os').system('touch {marker}'),=cmd|'/c calc'!A1\n".encode()
    r = client.post("/api/predict/upload", files={"file": ("lc.csv", payload, "text/csv")})
    assert r.status_code == 422 and not marker.exists()


def test_batch_predict(client):
    r = client.post("/api/predict/batch", json={"sample_ids": ["K09000.01", "K09001.01", "NOPE"]})
    body = r.json()
    assert r.status_code == 200 and body["count"] == 3 and body["n_ok"] == 2
    assert body["results"][2]["ok"] is False and body["results"][2]["error"]["code"] == "sample_not_found"
    assert client.post("/api/predict/batch", json={"sample_ids": []}).status_code == 422
    too_many = client.post("/api/predict/batch", json={"sample_ids": ["K09000.01"] * 26})
    assert too_many.status_code == 413


def test_training_stop_when_idle_is_409(client):
    r = client.post("/api/training/stop")
    assert r.status_code == 409 and r.json()["error"]["code"] == "training_not_running"


def test_training_start_duplicate_stop(client):
    with client.websocket_connect("/ws/training") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        r = client.post("/api/training/start", json={"epochs": 300, "batch_size": 8})
        assert r.status_code == 202 and r.json()["status"]["state"] == "running"
        dup = client.post("/api/training/start", json={"epochs": 1})
        assert dup.status_code == 409 and dup.json()["error"]["code"] == "training_already_running"
        seen = []
        while "epoch_end" not in seen:
            seen.append(ws.receive_json()["type"])
        assert "train_begin" in seen
        assert client.get("/api/training/status").json()["epoch"] >= 1
        assert client.post("/api/training/stop").status_code == 200
        while seen[-1] != "finished":
            seen.append(ws.receive_json()["type"])
        assert "stopped" in seen
    status = client.get("/api/training/status").json()
    assert status["state"] == "stopped" and status["is_running"] is False
    assert len(status["history"]["loss"]) >= 1


def test_training_completes_and_hot_swaps_model(client):
    from backend.api.state import state
    before = state.predictor.loaded_at
    assert client.post("/api/training/start", json={"epochs": 2, "batch_size": 8}).status_code == 202
    deadline = time.time() + 120
    while client.get("/api/training/status").json()["is_running"] and time.time() < deadline:
        time.sleep(0.2)
    status = client.get("/api/training/status").json()
    assert status["state"] == "completed", status
    assert state.predictor.loaded_at > before
    history = client.get("/api/training/history").json()
    assert history["last_completed"]["epochs_run"] == len(status["history"]["loss"])
    assert history["last_completed"]["history"]["loss"] == pytest.approx(status["history"]["loss"])
    assert client.post("/api/predict", json={"sample_id": "K09000.01"}).status_code == 200


def test_invalid_training_params(client):
    assert client.post("/api/training/start", json={"epochs": 0}).status_code == 422
    assert client.post("/api/training/start", json={"learning_rate": 5}).status_code == 422


def test_not_trained_state(client, monkeypatch):
    monkeypatch.setattr(predict_mod, "_predictor", None)
    assert client.get("/api/model/status").json()["trained"] is False
    assert client.get("/api/health").json()["model_loaded"] is False
    r = client.post("/api/predict", json={"sample_id": "K09000.01"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "model_not_trained"


def test_unknown_route_is_structured_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


# ---- regressions found by the Phase 3 verifier ----

@pytest.mark.parametrize("payload", [
    {"flux": []},
    {"flux": [None, None, None]},
    {"flux": [None] * 400},
    {"flux": [], "period": 2, "t0": 1, "duration_hours": 2},
    {"flux": [0.0] * 5000},
    {"flux": [1.0 + 0.001 * (i % 7) for i in range(3000)], "time": [None] * 3000},
    {"flux": [1.0 + 0.001 * (i % 7) for i in range(3000)], "time": [None] * 3000, "period": 2, "t0": 1, "duration_hours": 2},
    {"flux": [1.0 + 0.001 * (i % 7) for i in range(3000)], "time": [i * 1e300 for i in range(3000)]},
    {"flux": [1.0] * 5000},
    {"flux": [1e308] * 5000},
])
def test_degenerate_inline_input_is_rejected_not_crashed(client, payload):
    r = client.post("/api/predict", json=payload)
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "cannot_process"


def test_single_long_line_upload_is_rejected_quickly(client):
    started = time.time()
    r = client.post("/api/predict/upload/inspect", files={"file": ("nines.csv", b"9" * 2_000_000, "text/csv")})
    assert r.status_code == 400 and r.json()["error"]["code"] == "csv_parse_error"
    assert time.time() - started < 5


def test_single_column_csv_with_and_without_header(client):
    values = "\n".join(f"{1000 + 0.37 * i:.2f}" for i in range(3000))
    with_header = client.post("/api/predict/upload/inspect",
                              files={"file": ("one.csv", f"flux\n{values}".encode(), "text/csv")}).json()
    assert [c["name"] for c in with_header["columns"]] == ["flux"]
    assert with_header["n_rows"] == 3000 and with_header["suggested_mapping"]["flux"] == "flux"
    headerless = client.post("/api/predict/upload/inspect",
                             files={"file": ("one.csv", values.encode(), "text/csv")}).json()
    assert headerless["has_header"] is False and headerless["n_rows"] == 3000  # first row is data, not a header
    assert [c["name"] for c in headerless["columns"]] == ["column_1"]


@pytest.mark.parametrize("sep", [",", "\t", ";", " "])
def test_upload_delimiters(client, sep):
    t, f = make_synthetic_curve(seed=21, n_days=60.0)
    body = "\n".join([f"time{sep}flux"] + [f"{a:.6f}{sep}{b:.4f}" for a, b in zip(t, f)]).encode()
    r = client.post("/api/predict/upload", files={"file": ("lc.txt", body, "text/plain")},
                    data={"period": "3.2", "t0": "1.1", "duration_hours": "3.0"})
    assert r.status_code == 200, r.text
    assert r.json()["upload"]["time_column"] == "time" and r.json()["upload"]["n_rows"] == len(t)


def test_flat_signal_with_ephemeris_carries_a_warning(client):
    rng = np.random.default_rng(0)
    flux = (1000 + rng.normal(0, 0.0, 3000)).tolist()
    r = client.post("/api/predict", json={"flux": flux, "period": 3.2, "t0": 1.1, "duration_hours": 3.0, "explain": False})
    assert r.status_code == 200
    assert any("flat" in w for w in r.json()["warnings"])


def test_estimated_ephemeris_has_its_own_timed_stage(client):
    t, f = make_synthetic_curve(period=4.7, depth=0.006, n_days=90.0, seed=11)
    body = client.post("/api/predict", json={"time": t.tolist(), "flux": f.tolist(), "explain": False}).json()
    assert body["processing"]["stage_order"] == ["loading", "validating", "ephemeris_search", "normalizing",
                                                 "extracting_features", "cnn_inference", "preparing_results"]
    assert body["processing"]["stages_ms"]["ephemeris_search"] > body["processing"]["stages_ms"]["validating"]


def test_unexpected_error_is_json_500_with_cors_headers(client, monkeypatch):
    from backend.api import routes_dataset

    def boom():
        raise RuntimeError("boom")

    monkeypatch.setattr(routes_dataset.ds, "load_manifest", boom)
    r = client.get("/api/dataset/stats", headers={"origin": "http://localhost:3000"})
    assert r.status_code == 500 and r.json()["error"]["code"] == "internal_error"
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_websocket_rejects_disallowed_origin(client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/training", headers={"origin": "http://evil.example"}) as ws:
            ws.receive_json()
    with client.websocket_connect("/ws/training", headers={"origin": "http://localhost:3000"}) as ws:
        assert ws.receive_json()["type"] == "snapshot"


def test_huge_integers_and_long_cells_do_not_crash_inspect(client):
    body = b"time,flux\n1," + b"9" * 500 + b"\n2,3\n3,4\n"
    r = client.post("/api/predict/upload/inspect", files={"file": ("big.csv", body, "text/csv")})
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["preview"][0][1]) <= 41  # long cells are truncated in the preview
    flux = next(c for c in data["columns"] if c["name"] == "flux")
    assert flux["n_missing"] == 1  # the overflowing value is not a usable number


def test_idle_training_status_has_empty_history_lists():
    from backend.api.training_manager import HISTORY_KEYS, TrainingManager

    snapshot = TrainingManager().snapshot()
    assert snapshot["state"] == "idle" and snapshot["is_running"] is False
    assert snapshot["history"] == {k: [] for k in HISTORY_KEYS}
