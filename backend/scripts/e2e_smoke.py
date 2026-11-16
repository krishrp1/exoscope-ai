"""End-to-end smoke test against a RUNNING backend: predict, CSV upload, and the live training stream.

Run (backend must be up, model trained):
    python -m backend.scripts.e2e_smoke                 # predict + upload + rejection checks
    python -m backend.scripts.e2e_smoke --with-training # also runs a 2-epoch job over the WebSocket

The training step replaces the served model with a 2-epoch one. Retrain afterwards with
`python -m backend.ml.train` and restart the backend.
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import sys

import httpx
import numpy as np
import websockets

from backend.ml.dataset import load_lightcurve


def check(name: str, ok: bool, detail: str = "") -> bool:
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")
    return ok


async def training_stream(base: str) -> bool:
    seen: dict[str, int] = {}
    async with websockets.connect(base.replace("http", "ws", 1) + "/ws/training") as ws:
        json.loads(await ws.recv())  # snapshot
        async with httpx.AsyncClient() as client:
            r = await client.post(f"{base}/api/training/start", json={"epochs": 2})
            if r.status_code != 202:
                return check("training start", False, r.text)
            dup = await client.post(f"{base}/api/training/start", json={"epochs": 2})
        ok = check("duplicate start is rejected", dup.status_code == 409, str(dup.status_code))
        async for raw in ws:
            event = json.loads(raw)
            seen[event["type"]] = seen.get(event["type"], 0) + 1
            if event["type"] == "finished":
                ok &= check("training finished", event["state"] == "completed", event["state"])
                break
    ok &= check("stream carried real events", seen.get("epoch_end") == 2 and seen.get("batch", 0) > 0
                and seen.get("completed") == 1, json.dumps(seen))
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--with-training", action="store_true")
    args = parser.parse_args()
    base, ok = args.base, True

    with httpx.Client(base_url=base, timeout=120) as c:
        health = c.get("/api/health").json()
        ok &= check("health", health["status"] == "ok" and health["model_loaded"], json.dumps(health))
        sample = c.get("/api/dataset/samples", params={"split": "test", "page_size": 1}).json()["items"][0]

        pred = c.post("/api/predict", json={"sample_id": sample["id"]}).json()
        ok &= check("predict dataset sample", abs(sum(pred["probabilities"].values()) - 1) < 1e-5
                    and set(pred["explanation"]["methods"]) == {"saliency", "integrated_gradients", "occlusion"},
                    f"{sample['id']} -> {pred['predicted_class']} {pred['confidence']:.4f}")

        lc = load_lightcurve(sample["kepid"])  # a real light curve, exported to CSV like a user would
        buf = io.StringIO()
        np.savetxt(buf, np.column_stack([lc["time"], lc["flux"]]), delimiter=",", header="time,flux", comments="")
        files = {"file": ("curve.csv", buf.getvalue().encode(), "text/csv")}
        eph = {"period": sample["koi_period"], "t0": sample["koi_time0bk"], "duration_hours": sample["koi_duration"]}
        up = c.post("/api/predict/upload", files=files, data=eph).json()
        same = abs(up["probabilities"]["CONFIRMED"] - pred["probabilities"]["CONFIRMED"]) < 1e-3
        ok &= check("upload reproduces the dataset-sample score", same,
                    f"{up['probabilities']['CONFIRMED']:.4f} vs {pred['probabilities']['CONFIRMED']:.4f}")

        bad = c.post("/api/predict/upload", files={"file": ("x.png", b"\x89PNG", "image/png")})
        ok &= check("invalid upload is rejected", bad.status_code == 415, bad.json()["error"]["code"])

    if args.with_training:
        ok &= asyncio.run(training_stream(base))
        with httpx.Client(base_url=base, timeout=60) as c:
            ok &= check("model hot-swapped and serving", c.post("/api/predict", json={"sample_id": sample["id"]}).status_code == 200)
    print("ALL PASS" if ok else "SOME CHECKS FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
