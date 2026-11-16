"use client";

import { ProvenanceBadge } from "@/components/common/badges";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/format";

/** Dataset figures read live from the backend. Shows no numbers when the backend is unreachable. */
export function LiveDatasetFacts() {
  const { data, error, loading } = useApi(api.datasetStats);
  if (loading && !data) return <p className="text-sm text-muted-foreground" role="status">Loading live dataset figures.</p>;
  if (error || !data) {
    return (
      <p className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground" role="status">
        Live dataset figures appear here when the ExoScope backend is running.
      </p>
    );
  }
  const c = data.catalog.class_counts;
  const facts: [string, string, string][] = [
    [fmtInt(data.catalog.n_koi), "signals in the KOI catalog", "kaggle"],
    [fmtInt(c["CONFIRMED"]), "confirmed planets", "kaggle"],
    [fmtInt(c["FALSE POSITIVE"]), "false positives", "kaggle"],
    [fmtInt(c["CANDIDATE"]), "unresolved candidates", "kaggle"],
    [fmtInt(data.light_curves.n_targets_available), "stars with a fetched Kepler light curve", "mast"],
    [fmtInt(data.light_curves.n_observations_total), "brightness measurements", "mast"],
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {facts.map(([value, label]) => (
          <div key={label} className="glass min-w-0 rounded-xl px-3 py-3 sm:px-4">
            <dd className="data text-lg font-semibold [overflow-wrap:anywhere] text-primary xl:text-xl">{value}</dd>
            <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        {fmtPct(data.catalog.positive_fraction_of_labelled)} of resolved catalog signals are confirmed planets.
        Figures are read from the running backend.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ProvenanceBadge kind="kaggle" />
        <ProvenanceBadge kind="mast" />
      </div>
    </div>
  );
}
