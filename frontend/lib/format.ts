// Number and label formatting shared by all pages.

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return Math.round(value).toLocaleString("en-US");
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "n/a";
  if (seconds < 60) return `${seconds.toFixed(0)} s`;
  const m = Math.floor(seconds / 60);
  return `${m} min ${Math.round(seconds - m * 60)} s`;
}

export const SPLIT_LABEL: Record<string, string> = {
  train: "Training",
  val: "Validation",
  test: "Test",
  unlabeled: "Unlabeled",
  "not processed": "Not processed",
};

export const STAGE_LABEL: Record<string, string> = {
  loading: "Loading",
  validating: "Validating",
  ephemeris_search: "Estimating period (BLS)",
  normalizing: "Normalizing",
  extracting_features: "Extracting features",
  cnn_inference: "CNN inference",
  preparing_results: "Preparing results",
};

export const CLASS_COLOR: Record<string, string> = {
  CONFIRMED: "#4ade80",
  "FALSE POSITIVE": "#fbbf24",
  CANDIDATE: "#a78bfa",
};
