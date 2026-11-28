"use client";

import { AnimatedNumber } from "@/components/effects";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/format";

/** Held-out test figures, read from the running model. Shows nothing invented when the backend is away. */
export function ModelFacts() {
  const { data, error } = useApi(api.modelStatus);
  const s = data?.summary;
  return (
    <div className="glass rounded-2xl p-4">
      <p className="eyebrow">Held-out test split</p>
      {s ? (
        <dl className="mt-3 grid grid-cols-3 gap-3">
          {([[fmtPct(s.roc_auc), "ROC-AUC"], [fmtPct(s.accuracy), "accuracy"], [fmtInt(s.n_samples), "unseen signals"]] as const).map(([v, label]) => (
            <div key={label}>
              <dd className="data text-xl font-semibold text-foreground"><AnimatedNumber value={v} /></dd>
              <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {error ? "Model figures appear here when the backend is reachable." : "Reading the model's test results."}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Stars in this split were never seen in training.</p>
    </div>
  );
}
