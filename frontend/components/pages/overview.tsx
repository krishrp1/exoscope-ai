"use client";

import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import Link from "next/link";

import { DispositionBadge, ProvenanceBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { Disclaimer, Panel, Stat } from "@/components/common/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ClassBars } from "@/components/charts/class-bars";
import { Sparkline } from "@/components/charts/sparkline";
import { buttonVariants } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { CLASS_COLOR, fmt, fmtDate, fmtInt, fmtPct } from "@/lib/format";
import type { DatasetStats, Sample } from "@/types/api";

const CLASSES = ["CONFIRMED", "FALSE POSITIVE", "CANDIDATE"];

function HealthRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <div role="listitem" className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="flex items-center gap-2">
        <Icon className={ok ? "size-4 text-success" : "size-4 text-warning"} aria-hidden="true" />
        <span className="sr-only">{ok ? "OK:" : "Note:"}</span>
        {label}
      </span>
      <span className="data shrink-0 text-muted-foreground">{value}</span>
    </div>
  );
}

function SampleCurve({ sample }: { sample: Sample }) {
  const { data, error, loading } = useApi(() => api.sample(sample.id, { max_points: 1, include_views: true }), [sample.id]);
  return (
    <Link href={`/observatory/light-curves?id=${encodeURIComponent(sample.id)}`}
          className="glass block rounded-xl p-3 transition-colors hover:border-primary/50">
      <div className="flex items-center justify-between gap-2">
        <span className="data text-sm font-medium">{sample.kepoi_name}</span>
        <DispositionBadge value={sample.koi_disposition} />
      </div>
      <div className="mt-2 h-11">
        {loading && !data ? <div className="h-full animate-pulse rounded bg-muted" role="status" aria-label="Loading curve" />
          : error || !data?.views ? <p className="text-xs text-muted-foreground">Curve unavailable</p>
          : <Sparkline values={data.views.local_view.flux} color={CLASS_COLOR[sample.koi_disposition]}
                       ariaLabel={`Folded transit view of ${sample.kepoi_name}`} />}
      </div>
      <p className="data mt-1.5 text-xs text-muted-foreground">P = {fmt(sample.koi_period, 2)} d · folded local view</p>
    </Link>
  );
}

function ClassDistribution({ stats }: { stats: DatasetStats }) {
  const rows = CLASSES.map((name) => ({
    name,
    catalog: stats.catalog.class_counts[name] ?? 0,
    with_curves: stats.light_curves.class_counts[name] ?? 0,
  }));
  return (
    <ClassBars rows={rows} ariaLabel="Signals per class: full catalog compared with signals that have a fetched light curve"
               series={[{ key: "catalog", label: "KOI catalog", color: "#38bdf8" },
                        { key: "with_curves", label: "With light curve", color: "#a78bfa" }]} />
  );
}

export function OverviewPage() {
  const stats = useApi(api.datasetStats);
  const model = useApi(api.modelStatus);
  const recent = useApi(api.recentPredictions);
  const samples = useApi(() => api.samples({ split: "test", page_size: 6 }));

  const s = stats.data;
  const m = model.data;

  return (
    <>
      <PageHeader title="Overview" description="Live status of the dataset, the model and recent activity. Every figure is read from the backend."
                  actions={<Link href="/observatory/detect" className={buttonVariants()}>Classify a signal <ArrowRight aria-hidden="true" /></Link>} />

      {stats.error && <ErrorState className="mb-5" title="Dataset statistics are unavailable" message={stats.error.message} onRetry={stats.refetch} />}
      {model.error && <ErrorState className="mb-5" title="Model status is unavailable" message={model.error.message} onRetry={model.refetch} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Catalog signals" value={s ? fmtInt(s.catalog.n_koi) : "…"}
              hint={s ? `${fmtInt(s.catalog.n_targets)} stars · Kaggle KOI table` : "loading"} />
        <Stat label="Light curves available" value={s ? fmtInt(s.light_curves.n_targets_available) : "…"} tone="primary"
              hint={s ? `${fmtInt(s.light_curves.n_koi_available)} signals · ${fmtInt(s.light_curves.n_observations_total)} measurements` : "loading"} />
        <Stat label="Model status" tone={m?.trained ? "success" : "warning"}
              value={!m ? "…" : m.trained ? "Trained" : "Not trained"}
              hint={m?.trained ? `Last trained ${fmtDate(m.trained_at)}` : m ? "Start a run in the Training Monitor" : "loading"} />
        <Stat label="Test accuracy" value={m?.trained ? fmtPct(m.summary?.accuracy) : m ? "n/a" : "…"}
              hint={m?.trained ? `Recall ${fmtPct(m.summary?.recall)} · precision ${fmtPct(m.summary?.precision)} on ${fmtInt(m.summary?.n_samples)} held-out signals`
                               : "No model has been evaluated yet"} />
      </div>

      {m && !m.trained && (
        <EmptyState className="mt-5" title="No trained model yet"
                    message="Model metrics and predictions appear after the first training run. Nothing is shown in their place."
                    action={<Link href="/observatory/training" className={buttonVariants()}>Open the Training Monitor</Link>} />
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Class distribution"
               description="Dataset labels (koi_disposition). Candidates are unresolved and never used for training or evaluation."
               actions={<ProvenanceBadge kind="kaggle" />}>
          {s ? <ClassDistribution stats={s} /> : stats.error ? <p className="text-sm text-muted-foreground">Unavailable.</p> : <LoadingState rows={3} />}
          {s && (
            <p className="mt-3 text-xs text-muted-foreground">
              {fmtPct(s.catalog.positive_fraction_of_labelled)} of resolved catalog signals are CONFIRMED. Light curves were fetched for a
              sample of stars, so the second bar is smaller.
            </p>
          )}
        </Panel>

        <Panel title="Dataset health" description="Computed from the files on disk">
          {s ? (
            <ul role="list">
              <HealthRow ok={s.health.n_exact_duplicate_rows === 0 && s.health.n_duplicate_koi_names === 0} label="Duplicate signals"
                         value={fmtInt(s.health.n_duplicate_koi_names)} />
              <HealthRow ok={s.health.n_koi_missing_ephemeris === 0} label="Signals missing an ephemeris" value={fmtInt(s.health.n_koi_missing_ephemeris)} />
              <HealthRow ok={(s.health.fetch_status_counts["error"] ?? 0) === 0} label="Light-curve downloads failed"
                         value={fmtInt((s.health.fetch_status_counts["error"] ?? 0) + (s.health.fetch_status_counts["no_data"] ?? 0))} />
              <HealthRow ok={(s.health.n_processing_failures ?? 0) === 0} label="Signals that failed preprocessing"
                         value={s.health.n_processing_failures === null ? "not processed yet" : fmtInt(s.health.n_processing_failures)} />
              <HealthRow ok={false} label="Catalog columns with missing values" value={`${s.health.n_columns_with_missing_values} of ${s.catalog.n_columns}`} />
              <HealthRow ok label="Train / validation / test"
                         value={["train", "val", "test"].map((k) => fmtInt(s.splits[k]?.n_samples ?? 0)).join(" / ")} />
              <HealthRow ok={!s.synthetic_data_used} label="Synthetic data in training" value={s.synthetic_data_used ? "yes" : "none"} />
            </ul>
          ) : stats.error ? <p className="text-sm text-muted-foreground">Unavailable.</p> : <LoadingState rows={4} />}
          {s && <p className="mt-2 text-xs text-muted-foreground">{s.health.split_by}.</p>}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Sample signals" description="Six signals from the held-out test split. Select one to open it in the explorer."
               actions={<ProvenanceBadge kind="mast" />}>
          {samples.error ? <ErrorState message={samples.error.message} onRetry={samples.refetch} />
            : !samples.data ? <LoadingState rows={2} />
            : samples.data.items.length === 0 ? <EmptyState title="No processed samples yet" message="Fetch light curves and build the dataset first." />
            : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{samples.data.items.map((x) => <SampleCurve key={x.id} sample={x} />)}</div>}
        </Panel>

        <Panel title="Recent predictions" description="Since the backend started">
          {recent.error ? <ErrorState message={recent.error.message} onRetry={recent.refetch} />
            : !recent.data ? <LoadingState rows={3} />
            : recent.data.items.length === 0 ? (
              <EmptyState title="No predictions yet" message="Run a classification in the AI Detection Studio."
                          action={<Link href="/observatory/detect" className={buttonVariants({ variant: "outline", size: "sm" })}>Open the studio</Link>} />
            ) : (
              <ul className="divide-y divide-border/60">
                {recent.data.items.slice(0, 7).map((p, i) => (
                  <li key={`${p.timestamp}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="data block truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{fmtDate(p.timestamp)} · {p.source_type.replace("_", " ")}</span>
                    </span>
                    <span className="text-right">
                      <DispositionBadge value={p.predicted_class} />
                      <span className="data mt-0.5 block text-xs text-muted-foreground">score {fmt(p.confidence, 3)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
      </div>

      <Disclaimer className="mt-5">
        Model scores are softmax outputs. They are not the probability that an object is a confirmed planet.
      </Disclaimer>
    </>
  );
}
