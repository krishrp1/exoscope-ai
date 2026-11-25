// Types for the ExoScope AI backend responses (backend/api/*.py).

export type Disposition = "CONFIRMED" | "FALSE POSITIVE" | "CANDIDATE";
export type SplitName = "train" | "val" | "test" | "unlabeled" | "not processed";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface ProvenanceEntry {
  label: string;
  source: string;
}
export interface Provenance {
  catalog?: ProvenanceEntry;
  light_curves?: ProvenanceEntry;
}

export interface Health {
  status: string;
  version: string;
  time: string;
  model_loaded: boolean;
  n_samples: number;
  training_enabled: boolean;
  max_train_epochs: number;
  training_state: string;
  dataset_error: string | null;
}

export interface DatasetStats {
  catalog: {
    n_koi: number;
    n_columns: number;
    n_targets: number;
    class_counts: Record<string, number>;
    labelled_class_counts: Record<string, number>;
    positive_class: string;
    positive_fraction_of_labelled: number;
    provenance: ProvenanceEntry;
  };
  light_curves: {
    n_targets_available: number;
    n_koi_available: number;
    class_counts: Record<string, number>;
    n_observations_total: number;
    median_observations_per_target: number | null;
    median_time_span_days: number | null;
    median_quarters_per_target: number | null;
    provenance: ProvenanceEntry;
  };
  splits: Record<string, { n_samples: number; class_counts: Record<string, number> }>;
  health: {
    n_exact_duplicate_rows: number;
    n_duplicate_koi_names: number;
    n_koi_missing_ephemeris: number;
    n_columns_with_missing_values: number;
    n_columns_entirely_missing: number;
    fetch_status_counts: Record<string, number>;
    n_processing_failures: number | null;
    n_processed: number | null;
    split_by: string;
  };
  synthetic_data_used: boolean;
  dataset_error: string | null;
}

export interface Sample {
  id: string;
  kepoi_name: string;
  kepid: number;
  kepler_name: string | null;
  koi_disposition: Disposition;
  koi_period: number;
  koi_time0bk: number;
  koi_duration: number;
  koi_depth: number | null;
  koi_prad: number | null;
  koi_model_snr: number | null;
  koi_kepmag: number | null;
  koi_teq: number | null;
  koi_steff: number | null;
  ra: number | null;
  dec: number | null;
  split: SplitName;
  is_labelled: boolean;
}

export interface SampleList {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  items: Sample[];
  provenance: Provenance;
}

export interface SignalStats {
  n_input: number;
  n_missing_dropped: number;
  n_segments: number;
  n_outliers_clipped: number;
  n_used: number;
  time_span_days: number;
  n_transits_observed: number;
  n_in_transit_points: number;
  measured_depth_ppm: number | null;
  out_of_transit_scatter_ppm: number;
  global_empty_bins: number;
  local_empty_bins: number;
  local_half_width_hours: number;
}

export interface ProcessedViews {
  global_view: { phase: number[]; flux: number[] };
  local_view: { hours_from_mid_transit: number[]; flux: number[] };
  folded?: { phase: number[]; flux: number[]; n_total: number; n_shown: number };
  view_normalization?: string;
  signal?: SignalStats;
}

export interface SampleDetail {
  sample: Sample;
  lightcurve: {
    mode: "raw" | "normalized";
    time: number[];
    flux: number[];
    n_total: number;
    n_returned: number;
    decimated: boolean;
    time_unit: string;
    flux_unit: string;
  };
  transits: {
    times: number[];
    n_total: number;
    n_returned: number;
    duration_hours: number;
    period_days: number;
    source: string;
  };
  metadata: {
    target_id: string;
    koi_name: string;
    observation_count: number;
    duration_days: number;
    time_range: [number, number];
    flux_range: [number, number];
    n_quarters: number;
    median_cadence_minutes: number;
    dataset_label: Disposition;
    split: SplitName;
  };
  views: ProcessedViews | null;
  processing_error: string | null;
  provenance: Provenance;
}

export interface LayerInfo {
  name: string;
  type: string;
  output_shape: (number | null)[];
  params: number;
}

export interface MetricSummary {
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  roc_auc: number | null;
  pr_auc: number | null;
  n_samples: number | null;
  n_positive: number | null;
}

export interface ModelStatus {
  trained: boolean;
  message?: string;
  trained_at?: string;
  class_names: string[];
  positive_class?: string;
  architecture?: {
    name: string;
    input_shape: number[];
    output_shape: number[];
    total_params: number;
    layers: LayerInfo[];
  };
  train_params?: Record<string, number | boolean>;
  preprocessing?: Record<string, number>;
  standardizer?: { fitted_on: string; n_fit_samples: number };
  explanation_methods?: Record<string, string>;
  summary?: MetricSummary;
  epochs_run?: number;
  best_epoch?: number;
  disclaimer?: string;
}

export interface SplitMetrics {
  n_samples: number;
  n_positive: number;
  n_negative: number;
  positive_class: string;
  positive_prevalence: number;
  decision_rule: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number | null;
  pr_auc: number | null;
  confusion_matrix: { labels: string[]; matrix: number[][]; layout: string };
  per_class: Record<string, { precision: number; recall: number; f1: number; support: number }>;
  roc_curve?: { fpr: number[]; tpr: number[] };
  pr_curve?: { recall: number[]; precision: number[] };
}

export interface TrainingHistory {
  loss: number[];
  accuracy: number[];
  val_loss: number[];
  val_accuracy: number[];
  learning_rate: number[];
}

export interface ModelMetrics {
  trained: boolean;
  message?: string;
  metrics?: {
    trained_at: string;
    duration_seconds: number;
    epochs_run: number;
    best_epoch: number;
    early_stopped: boolean;
    splits: Record<string, Record<string, number>>;
    class_weights: Record<string, number>;
    test: SplitMetrics;
    validation: SplitMetrics;
    provenance: { labels: string; light_curves: string };
  };
  history?: TrainingHistory;
  train_params?: Record<string, number | boolean>;
  plots?: string[];
  note?: string;
}

export interface Ephemeris {
  period: number;
  t0: number;
  duration_hours: number;
  source: string;
  depth_ppm?: number;
  bls_snr?: number;
  method?: string;
  note?: string;
}

export type ExplainMethod = "saliency" | "integrated_gradients" | "occlusion";

export interface Explanation {
  target_class: string;
  disclaimer: string;
  channels: string[];
  methods: Record<string, { label: string; global: number[]; local: number[] }>;
}

export interface Processing {
  stages_ms: Record<string, number>;
  total_ms: number;
  stage_order: string[];
}

export interface PredictionSource {
  type: "dataset_sample" | "upload" | "inline";
  name: string;
  dataset_label: Disposition | null;
  sample?: Sample;
  split?: SplitName;
  label_is_resolved?: boolean;
  agrees_with_label?: boolean | null;
  seen_in_training?: boolean;
  provenance: Provenance;
}

export interface UploadReport {
  filename: string;
  size_bytes: number;
  time_column: string | null;
  flux_column: string;
  n_rows: number;
  has_header: boolean;
  n_rows_with_missing_values: number;
  missing_value_handling: string;
  time_axis: string;
}

export interface Prediction {
  predicted_class: string;
  predicted_index: number;
  confidence: number;
  probabilities: Record<string, number>;
  ephemeris: Ephemeris;
  processed: ProcessedViews;
  signal: SignalStats;
  warnings: string[];
  disclaimer: string;
  explanation?: Explanation;
  processing: Processing;
  source: PredictionSource;
  upload?: UploadReport;
}

export interface BatchItem {
  sample_id: string;
  ok: boolean;
  error?: { code: string; message: string };
  predicted_class?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  processing?: Processing;
  source?: PredictionSource;
  signal?: SignalStats;
  ephemeris?: Ephemeris;
  processed?: ProcessedViews;
  explanation?: Explanation;
}

export interface BatchPrediction {
  count: number;
  n_ok: number;
  results: BatchItem[];
}

export interface UploadInspection {
  filename: string;
  size_bytes: number;
  n_rows: number;
  columns: { name: string; n_numeric: number; n_missing: number; is_numeric: boolean }[];
  suggested_mapping: { time: string | null; flux: string | null };
  preview: string[][];
  has_header: boolean;
  help: string;
}

export interface RecentPrediction {
  timestamp: string;
  source_type: string;
  name: string;
  dataset_label: string | null;
  predicted_class: string;
  confidence: number;
  total_ms: number;
}

export type TrainingState = "idle" | "running" | "stopping" | "completed" | "stopped" | "failed";

export interface TrainingStatus {
  state: TrainingState;
  run_id: string | null;
  is_running: boolean;
  started_at?: string;
  finished_at?: string | null;
  params?: Record<string, number | boolean>;
  epoch?: number;
  epochs?: number;
  batch?: number;
  steps_per_epoch?: number | null;
  message?: string;
  error?: string | null;
  eta_seconds?: number | null;
  latest?: Record<string, number>;
  history?: TrainingHistory;
  dataset?: { n_train: number; n_val: number; n_test: number };
  result?: { epochs_run: number; best_epoch: number; duration_seconds: number } | null;
}

export interface TrainingEvent {
  type: string;
  timestamp?: string;
  message?: string;
  state?: string;
  epoch?: number;
  epochs?: number;
  batch?: number;
  steps_per_epoch?: number;
  loss?: number;
  accuracy?: number;
  val_loss?: number;
  val_accuracy?: number;
  learning_rate?: number;
  epoch_seconds?: number;
  epochs_run?: number;
  best_epoch?: number;
  epochs_completed?: number;
  status?: TrainingStatus;
  events?: TrainingEvent[];
  test?: Record<string, number>;
}

export interface TrainingHistoryResponse {
  last_completed: {
    history: TrainingHistory;
    epochs_run: number;
    best_epoch: number;
    params: Record<string, number | boolean>;
    trained_at: string;
  } | null;
  current: {
    state: TrainingState;
    run_id: string;
    history: TrainingHistory;
    params: Record<string, number | boolean>;
    started_at: string;
    finished_at: string | null;
  } | null;
}

export interface TrainingStartParams {
  epochs: number;
  batch_size: number;
  learning_rate: number;
}
