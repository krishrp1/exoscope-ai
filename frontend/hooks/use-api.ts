"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

type Primitive = string | number | boolean | null | undefined;

function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, "unknown_error", String(err));
}

/**
 * Runs `fetcher` on mount and whenever `deps` change. Keeps the previous data visible while refetching.
 * `loading` is derived: it is true until the request for the current deps has settled.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: Primitive[] = [], enabled = true): AsyncState<T> {
  const [tick, setTick] = useState(0);
  const runKey = `${tick}|${JSON.stringify(deps)}`;
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; settledKey: string | null }>({
    data: null, error: null, settledKey: null,
  });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetcherRef.current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, settledKey: runKey });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState((prev) => ({ data: prev.data, error: toApiError(err), settledKey: runKey }));
      });
    return () => {
      cancelled = true;
    };
  }, [runKey, enabled]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data: state.data, error: state.error, loading: enabled && state.settledKey !== runKey, refetch };
}

/** Wraps an async action (a button press) with loading and error state. */
export function useAction<A extends unknown[], T>(action: (...args: A) => Promise<T>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  });
  const run = useCallback(async (...args: A): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      return await actionRef.current(...args);
    } catch (err) {
      setError(toApiError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  const clearError = useCallback(() => setError(null), []);
  return { run, loading, error, clearError };
}
