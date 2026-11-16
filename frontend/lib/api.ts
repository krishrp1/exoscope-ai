// Typed client for the ExoScope AI backend. One base URL, from the environment.
import type {
  ApiErrorBody, BatchPrediction, DatasetStats, Health, ModelMetrics, ModelStatus, Prediction,
  RecentPrediction, SampleDetail, SampleList, TrainingHistoryResponse, TrainingStartParams,
  TrainingStatus, UploadInspection,
} from "@/types/api";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiError(0, "network_error",
      `Cannot reach the ExoScope backend at ${API_BASE_URL}. Is it running?`);
  }
  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* not JSON */
    }
    throw new ApiError(response.status, body?.error?.code ?? "http_error",
      body?.error?.message ?? `Request failed with status ${response.status}.`, body?.error?.details);
  }
  return (await response.json()) as T;
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export interface SampleQuery {
  search?: string;
  disposition?: string;
  split?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface UploadOptions {
  time_column?: string | null;
  flux_column?: string | null;
  period?: number | null;
  t0?: number | null;
  duration_hours?: number | null;
}

export const api = {
  health: () => request<Health>("/api/health"),
  datasetStats: () => request<DatasetStats>("/api/dataset/stats"),
  samples: (q: SampleQuery = {}) => request<SampleList>(`/api/dataset/samples${query({ ...q })}`),
  sample: (id: string, opts: { mode?: "raw" | "normalized"; max_points?: number; include_views?: boolean } = {}) =>
    request<SampleDetail>(`/api/dataset/samples/${encodeURIComponent(id)}${query({ ...opts })}`),
  modelStatus: () => request<ModelStatus>("/api/model/status"),
  modelMetrics: () => request<ModelMetrics>("/api/model/metrics"),
  predictSample: (sampleId: string) => request<Prediction>("/api/predict", json({ sample_id: sampleId })),
  predictBatch: (sampleIds: string[], explain = false) =>
    request<BatchPrediction>("/api/predict/batch", json({ sample_ids: sampleIds, explain })),
  inspectUpload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<UploadInspection>("/api/predict/upload/inspect", { method: "POST", body: form });
  },
  predictUpload: (file: File, opts: UploadOptions = {}) => {
    const form = new FormData();
    form.append("file", file);
    for (const [key, value] of Object.entries(opts)) {
      if (value !== undefined && value !== null && value !== "") form.append(key, String(value));
    }
    return request<Prediction>("/api/predict/upload", { method: "POST", body: form });
  },
  recentPredictions: () => request<{ items: RecentPrediction[]; note: string }>("/api/predictions/recent"),
  trainingStatus: () => request<TrainingStatus>("/api/training/status"),
  trainingHistory: () => request<TrainingHistoryResponse>("/api/training/history"),
  startTraining: (params: TrainingStartParams) =>
    request<{ started: boolean; status: TrainingStatus }>("/api/training/start", json(params)),
  stopTraining: () => request<{ stopping: boolean; status: TrainingStatus }>("/api/training/stop", { method: "POST" }),
};
