import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTrainingStream } from "@/hooks/use-training-stream";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  open() {
    act(() => this.onopen?.());
  }
  send(event: object) {
    act(() => this.onmessage?.({ data: JSON.stringify(event) }));
  }
}

const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1];

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useTrainingStream", () => {
  it("connects to the training socket and reports the connection state", () => {
    const { result } = renderHook(() => useTrainingStream());
    expect(latest().url).toBe("ws://localhost:8000/ws/training");
    expect(result.current.connection).toBe("connecting");
    latest().open();
    expect(result.current.connection).toBe("open");
  });

  it("accepts an idle snapshot that has no history", () => {
    const { result } = renderHook(() => useTrainingStream());
    latest().open();
    latest().send({ type: "snapshot", status: { state: "idle", run_id: null, is_running: false }, events: [] });
    expect(result.current.status?.state).toBe("idle");
    expect(result.current.history.loss).toEqual([]);
    expect(result.current.history.learning_rate).toEqual([]);
  });

  it("builds the charts' history only from epoch events", () => {
    const { result } = renderHook(() => useTrainingStream());
    latest().open();
    latest().send({ type: "snapshot", status: { state: "running", run_id: "r1", is_running: true, epochs: 3 }, events: [] });
    latest().send({ type: "train_begin", epochs: 3, steps_per_epoch: 46 });
    latest().send({ type: "batch", epoch: 1, batch: 5, steps_per_epoch: 46, loss: 0.7, accuracy: 0.5 });
    expect(result.current.batch).toEqual({ batch: 5, steps: 46, loss: 0.7, accuracy: 0.5 });
    expect(result.current.history.loss).toEqual([]);
    latest().send({ type: "epoch_end", epoch: 1, loss: 0.45, accuracy: 0.79, val_loss: 0.57, val_accuracy: 0.73, learning_rate: 0.001 });
    latest().send({ type: "epoch_end", epoch: 2, loss: 0.37, accuracy: 0.83, val_loss: 0.66, val_accuracy: 0.58, learning_rate: 0.0005 });
    expect(result.current.history.loss).toEqual([0.45, 0.37]);
    expect(result.current.history.val_accuracy).toEqual([0.73, 0.58]);
    expect(result.current.history.learning_rate).toEqual([0.001, 0.0005]);
    expect(result.current.log.map((e) => e.type)).toEqual(["train_begin", "epoch_end", "epoch_end"]); // batches are not logged
  });

  it("a new snapshot replaces the history instead of appending to it", () => {
    const { result } = renderHook(() => useTrainingStream());
    latest().open();
    latest().send({ type: "epoch_end", epoch: 1, loss: 0.4, accuracy: 0.8, val_loss: 0.5, val_accuracy: 0.7, learning_rate: 0.001 });
    latest().send({ type: "snapshot", events: [],
                    status: { state: "running", run_id: "r1", is_running: true,
                              history: { loss: [0.4, 0.3], accuracy: [0.8, 0.85], val_loss: [0.5, 0.4], val_accuracy: [0.7, 0.8], learning_rate: [0.001, 0.001] } } });
    expect(result.current.history.loss).toEqual([0.4, 0.3]);
  });

  it("reports a dropped connection and reconnects", () => {
    const { result } = renderHook(() => useTrainingStream());
    latest().open();
    act(() => latest().onclose?.());
    expect(result.current.connection).toBe("closed");
    act(() => { vi.advanceTimersByTime(1100); });
    expect(FakeSocket.instances).toHaveLength(2);
    expect(result.current.connection).toBe("connecting");
    latest().open();
    expect(result.current.connection).toBe("open");
  });
});
