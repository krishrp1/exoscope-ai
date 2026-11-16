"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { WS_BASE_URL } from "@/lib/api";
import type { TrainingEvent, TrainingHistory, TrainingStatus } from "@/types/api";

export type ConnectionState = "connecting" | "open" | "closed";

const EMPTY_HISTORY: TrainingHistory = { loss: [], accuracy: [], val_loss: [], val_accuracy: [], learning_rate: [] };
const HISTORY_KEYS = ["loss", "accuracy", "val_loss", "val_accuracy", "learning_rate"] as const;
const MAX_LOG = 200;

export interface TrainingStream {
  connection: ConnectionState;
  status: TrainingStatus | null;
  history: TrainingHistory;
  log: TrainingEvent[];
  batch: { batch: number; steps: number; loss: number; accuracy: number } | null;
  reconnect: () => void;
}

/** Live training state from the backend WebSocket. Reconnects with backoff after a drop. */
export function useTrainingStream(): TrainingStream {
  // Tagged with the attempt it belongs to, so a new attempt reads as "connecting" without an extra render.
  const [conn, setConn] = useState<{ attempt: number; value: ConnectionState }>({ attempt: 0, value: "connecting" });
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [history, setHistory] = useState<TrainingHistory>(EMPTY_HISTORY);
  const [log, setLog] = useState<TrainingEvent[]>([]);
  const [batch, setBatch] = useState<TrainingStream["batch"]>(null);
  const [attempt, setAttempt] = useState(0);
  const retryRef = useRef(0);

  useEffect(() => {
    let closedByUs = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ws = new WebSocket(`${WS_BASE_URL}/ws/training`);

    ws.onopen = () => {
      retryRef.current = 0;
      setConn({ attempt, value: "open" });
    };
    ws.onmessage = (message) => {
      const event = JSON.parse(message.data as string) as TrainingEvent;
      switch (event.type) {
        case "snapshot":
          setStatus(event.status ?? null);
          setHistory(event.status?.history ?? EMPTY_HISTORY);
          setLog((event.events ?? []).slice(-MAX_LOG));
          setBatch(null);
          return;
        case "heartbeat":
          return;
        case "batch":
          setBatch({ batch: event.batch ?? 0, steps: event.steps_per_epoch ?? 0, loss: event.loss ?? NaN,
                     accuracy: event.accuracy ?? NaN });
          setStatus((s) => (s ? { ...s, batch: event.batch } : s));
          return;
        case "train_begin":
          setHistory(EMPTY_HISTORY);
          setStatus((s) => (s ? { ...s, state: "running", is_running: true, epochs: event.epochs,
                                  steps_per_epoch: event.steps_per_epoch, message: "training" } : s));
          break;
        case "epoch_begin":
          setStatus((s) => (s ? { ...s, epoch: event.epoch, batch: 0 } : s));
          break;
        case "epoch_end":
          setHistory((h) => {
            const next = { ...h };
            for (const key of HISTORY_KEYS) next[key] = [...h[key], event[key] as number];
            return next;
          });
          break;
        case "status":
          setStatus((s) => (s ? { ...s, message: event.message,
                                  state: (event.state as TrainingStatus["state"]) ?? s.state } : s));
          break;
        case "finished":
          setStatus((s) => (s ? { ...s, state: (event.state as TrainingStatus["state"]) ?? s.state,
                                  is_running: false, eta_seconds: null } : s));
          // Resync with a fresh snapshot so finish time and results match the server exactly.
          closedByUs = true;
          setAttempt((n) => n + 1);
          break;
      }
      setLog((l) => [...l, event].slice(-MAX_LOG));
    };
    ws.onclose = () => {
      if (closedByUs) return;
      setConn({ attempt, value: "closed" });
      const delay = Math.min(1000 * 2 ** retryRef.current, 10000);
      retryRef.current += 1;
      timer = setTimeout(() => setAttempt((a) => a + 1), delay);
    };
    ws.onerror = () => ws.close();

    return () => {
      closedByUs = true;
      if (timer) clearTimeout(timer);
      ws.close();
    };
  }, [attempt]);

  const reconnect = useCallback(() => {
    retryRef.current = 0;
    setAttempt((a) => a + 1);
  }, []);
  const connection: ConnectionState = conn.attempt === attempt ? conn.value : "connecting";
  return { connection, status, history, log, batch, reconnect };
}
