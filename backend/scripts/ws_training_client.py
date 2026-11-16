"""Start a training run over HTTP and print the live WebSocket event stream.

Run (backend must be up):
    python -m backend.scripts.ws_training_client --epochs 5
"""
from __future__ import annotations

import argparse
import asyncio
import json

import httpx
import websockets


async def main(base: str, epochs: int, start: bool) -> None:
    ws_url = base.replace("http", "ws", 1) + "/ws/training"
    async with websockets.connect(ws_url) as ws:
        snapshot = json.loads(await ws.recv())
        print("connected; state:", snapshot["status"]["state"], flush=True)
        if start:
            async with httpx.AsyncClient() as client:
                r = await client.post(f"{base}/api/training/start", json={"epochs": epochs})
                print("POST /api/training/start ->", r.status_code, flush=True)
                if r.status_code != 202:
                    print(r.text)
                    return
        counts: dict[str, int] = {}
        async for raw in ws:
            event = json.loads(raw)
            counts[event["type"]] = counts.get(event["type"], 0) + 1
            if event["type"] == "batch":
                if event["batch"] == event["steps_per_epoch"]:
                    print(f"  batch {event['batch']}/{event['steps_per_epoch']} loss={event['loss']:.4f}", flush=True)
                continue
            if event["type"] != "heartbeat":
                print(json.dumps(event), flush=True)
            if event["type"] == "finished":
                break
        print("event counts:", counts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--listen-only", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.base, args.epochs, not args.listen_only))
