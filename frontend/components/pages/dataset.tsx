"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, LineChart, Radar, Search, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { DispositionBadge, ProvenanceBadge, SplitBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { KeyValue, Panel, Stat } from "@/components/common/panel";
import { selectClass, useDebounced } from "@/components/common/sample-picker";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ClassBars } from "@/components/charts/class-bars";
import { ViewsPlot } from "@/components/charts/views-plot";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { CLASS_COLOR, fmt, fmtInt, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Sample } from "@/types/api";

const COLUMNS: { key: string; label: string; numeric?: boolean; hideBelow?: "sm" | "md" | "lg" }[] = [
  { key: "kepoi_name", label: "KOI" },
  { key: "koi_disposition", label: "Dataset label" },
  { key: "koi_period", label: "Period (d)", numeric: true },
  { key: "koi_duration", label: "Duration (h)", numeric: true, hideBelow: "md" },
  { key: "koi_depth", label: "Depth (ppm)", numeric: true, hideBelow: "md" },
  { key: "koi_prad", label: "Radius (R⊕)", numeric: true, hideBelow: "lg" },
  { key: "koi_model_snr", label: "SNR", numeric: true, hideBelow: "lg" },
  { key: "koi_kepmag", label: "Kp mag", numeric: true, hideBelow: "lg" },
  { key: "split", label: "Split", hideBelow: "sm" },
];
const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

function cell(sample: Sample, key: string) {
  switch (key) {
    case "kepoi_name":
      return (
        <span>
          <span className="data font-medium">{sample.kepoi_name}</span>
          <span className="block text-xs text-muted-foreground">{sample.kepler_name ?? `KIC ${sample.kepid}`}</span>
        </span>
      );
    case "koi_disposition": return <DispositionBadge value={sample.koi_disposition} />;
    case "split": return <SplitBadge value={sample.split} />;
    case "koi_period": return fmt(sample.koi_period, 3);
    case "koi_duration": return fmt(sample.koi_duration, 2);
    case "koi_depth": return fmt(sample.koi_depth, 0);
    case "koi_prad": return fmt(sample.koi_prad, 2);
    case "koi_model_snr": return fmt(sample.koi_model_snr, 1);
    case "koi_kepmag": return fmt(sample.koi_kepmag, 2);
    default: return null;
  }
}

function TargetDetail({ sample, onClose }: { sample: Sample; onClose: () => void }) {
  const { data, error, loading, refetch } = useApi(() => api.sample(sample.id, { max_points: 1, include_views: true }), [sample.id]);
  return (
    <Panel title={`Target detail: ${sample.kepoi_name}`} description={sample.kepler_name ?? `KIC ${sample.kepid}`}
           actions={<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close target detail"><X aria-hidden="true" /></Button>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <DispositionBadge value={sample.koi_disposition} />
        <SplitBadge value={sample.split} />
      </div>
      <KeyValue columns={2} items={[
        ["Period", `${fmt(sample.koi_period, 4)} d`],
        ["Epoch (BKJD)", fmt(sample.koi_time0bk, 3)],
        ["Transit duration", `${fmt(sample.koi_duration, 2)} h`],
        ["Catalog depth", `${fmt(sample.koi_depth, 0)} ppm`],
        ["Planet radius", `${fmt(sample.koi_prad, 2)} R⊕`],
        ["Model SNR", fmt(sample.koi_model_snr, 1)],
        ["Kepler magnitude", fmt(sample.koi_kepmag, 2)],
        ["Star temperature", `${fmt(sample.koi_steff, 0)} K`],
        ["RA / Dec", `${fmt(sample.ra, 3)}° / ${fmt(sample.dec, 3)}°`],
        ["Observations", data ? fmtInt(data.metadata.observation_count) : "…"],
        ["Time span", data ? `${fmt(data.metadata.duration_days, 1)} d` : "…"],
        ["Quarters", data ? String(data.metadata.n_quarters) : "…"],
      ]} />
      <p className="mt-2 text-xs text-muted-foreground">Catalog values above are fitted parameters from the Kaggle table; observation counts come from the fetched light curve.</p>
      <div className="mt-4">
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Light-curve preview (folded on the catalog period)</h3>
        {error ? <ErrorState message={error.message} onRetry={refetch} />
          : loading && !data ? <LoadingState label="Loading light curve" rows={2} />
          : data?.views ? <ViewsPlot height={230} ariaLabel={`Folded global and local views of ${sample.kepoi_name}`}
                                     series={[{ name: sample.kepoi_name, views: data.views, color: CLASS_COLOR[sample.koi_disposition] }]} />
          : <EmptyState title="This light curve cannot be folded" message={data?.processing_error ?? undefined} />}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/observatory/light-curves?id=${encodeURIComponent(sample.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <LineChart aria-hidden="true" /> Open in Light Curve Explorer
        </Link>
        <Link href={`/observatory/detect?id=${encodeURIComponent(sample.id)}`} className={buttonVariants({ size: "sm" })}>
          <Radar aria-hidden="true" /> Classify in the studio
        </Link>
      </div>
    </Panel>
  );
}

export function DatasetPage() {
  const [search, setSearch] = useState("");
  const [disposition, setDisposition] = useState("");
  const [split, setSplit] = useState("");
  const [sort, setSort] = useState("kepoi_name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selected, setSelected] = useState<Sample | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const select = (item: Sample) => {
    setSelected(item);
    // On narrow screens the detail panel sits below the table, so bring it into view.
    if (window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };
  const debounced = useDebounced(search);

  const stats = useApi(api.datasetStats);
  const list = useApi(() => api.samples({ search: debounced, disposition, split, sort, order, page, page_size: pageSize }),
                      [debounced, disposition, split, sort, order, page, pageSize]);
  const s = stats.data;

  const toggleSort = (key: string) => {
    if (sort === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
  };
  const filtersActive = !!(search || disposition || split);
  const clearFilters = () => {
    setSearch("");
    setDisposition("");
    setSplit("");
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Dataset Explorer"
                  description="Signals from the Kaggle KOI catalog that have a fetched Kepler light curve. Search, filter, sort, and open any target."
                  actions={<><ProvenanceBadge kind="kaggle" /><ProvenanceBadge kind="mast" /></>} />

      {stats.error && <ErrorState className="mb-5" title="Dataset statistics are unavailable" message={stats.error.message} onRetry={stats.refetch} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Signals in the catalog" value={s ? fmtInt(s.catalog.n_koi) : "…"} hint={s ? `${s.catalog.n_columns} columns, ${fmtInt(s.catalog.n_targets)} stars` : undefined} />
        <Stat label="Signals with a light curve" value={s ? fmtInt(s.light_curves.n_koi_available) : "…"} tone="primary"
              hint={s ? `on ${fmtInt(s.light_curves.n_targets_available)} stars` : undefined} />
        <Stat label="Median observations per star" value={s ? fmtInt(s.light_curves.median_observations_per_target) : "…"}
              hint={s ? `median span ${fmt(s.light_curves.median_time_span_days, 0)} days, ${fmt(s.light_curves.median_quarters_per_target, 0)} quarters` : undefined} />
        <Stat label="Confirmed share (resolved labels)" value={s ? fmtPct(s.catalog.positive_fraction_of_labelled) : "…"}
              hint="CONFIRMED vs FALSE POSITIVE in the full catalog" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Panel title="Signals" bodyClassName="p-0 sm:p-0"
               description={list.data ? `${fmtInt(list.data.total)} match${list.data.total === 1 ? "es" : ""}` : undefined}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:px-5">
            <div className="relative min-w-44 flex-1">
              <label htmlFor="ds-search" className="sr-only">Search by KOI name, Kepler name or KIC id</label>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="ds-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search KOI, Kepler name, KIC" className="pl-8" />
            </div>
            <label htmlFor="ds-disp" className="sr-only">Filter by dataset label</label>
            <select id="ds-disp" className={selectClass} value={disposition} onChange={(e) => { setDisposition(e.target.value); setPage(1); }}>
              <option value="">All labels</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="FALSE POSITIVE">False positive</option>
              <option value="CANDIDATE">Candidate</option>
            </select>
            <label htmlFor="ds-split" className="sr-only">Filter by data split</label>
            <select id="ds-split" className={selectClass} value={split} onChange={(e) => { setSplit(e.target.value); setPage(1); }}>
              <option value="">All splits</option>
              <option value="train">Training</option>
              <option value="val">Validation</option>
              <option value="test">Test</option>
              <option value="unlabeled">Unlabeled</option>
            </select>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X aria-hidden="true" /> Clear filters
              </Button>
            )}
          </div>

          {list.error ? <div className="p-4"><ErrorState message={list.error.message} onRetry={list.refetch} /></div>
            : !list.data ? <div className="p-4"><LoadingState label="Loading signals" rows={6} /></div>
            : list.data.items.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No signals match these filters" message="Try a different search term, or clear the filters."
                            action={filtersActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined} />
              </div>
            ) : (
              <div className={cn("overflow-x-auto", list.loading && "opacity-60")} aria-busy={list.loading}>
                <table className="w-full text-sm">
                  <caption className="sr-only">Dataset signals. Select a row to see target detail.</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      {COLUMNS.map((c) => {
                        const active = sort === c.key;
                        const Icon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
                        return (
                          <th key={c.key} scope="col" aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
                              className={cn("px-3 py-2 font-medium first:pl-5", c.numeric && "text-right", c.hideBelow && HIDE[c.hideBelow])}>
                            <button type="button" onClick={() => toggleSort(c.key)}
                                    className={cn("inline-flex items-center gap-1 rounded hover:text-foreground", active && "text-primary")}>
                              {c.label} <Icon className="size-3" aria-hidden="true" />
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((item) => {
                      const isSelected = selected?.id === item.id;
                      return (
                        <tr key={item.id} tabIndex={0} aria-selected={isSelected}
                            onClick={() => select(item)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(item); } }}
                            className={cn("cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60",
                                          isSelected && "bg-primary/10")}>
                          {COLUMNS.map((c) => (
                            <td key={c.key} className={cn("px-3 py-2 first:pl-5", c.numeric && "data text-right", c.hideBelow && HIDE[c.hideBelow])}>
                              {cell(item, c.key)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          {list.data && list.data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-xs text-muted-foreground sm:px-5">
              <span className="data">
                {fmtInt((list.data.page - 1) * list.data.page_size + 1)} to {fmtInt(Math.min(list.data.page * list.data.page_size, list.data.total))} of {fmtInt(list.data.total)}
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor="ds-size">Rows</label>
                <select id="ds-size" className={cn(selectClass, "h-8 text-xs")} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[10, 15, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="data">page {list.data.page} / {list.data.pages}</span>
                <Button variant="outline" size="sm" disabled={page >= list.data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Panel>

        <div ref={detailRef} className="scroll-mt-20 space-y-5">
          {selected ? <TargetDetail sample={selected} onClose={() => setSelected(null)} />
            : <Panel title="Target detail"><EmptyState title="No target selected" message="Select a row in the table to see its parameters and a light-curve preview." /></Panel>}
          <Panel title="Labels by split" description="How the labelled signals are divided. No star appears in two splits.">
            {s && Object.keys(s.splits).length > 0 ? (
              <ClassBars height={220} ariaLabel="Confirmed and false positive counts in the training, validation and test splits"
                         rows={["train", "val", "test"].map((k) => ({
                           name: { train: "Training", val: "Validation", test: "Test" }[k] as string,
                           confirmed: s.splits[k]?.class_counts["CONFIRMED"] ?? 0,
                           false_positive: s.splits[k]?.class_counts["FALSE POSITIVE"] ?? 0,
                         }))}
                         series={[{ key: "confirmed", label: "CONFIRMED", color: CLASS_COLOR["CONFIRMED"] },
                                  { key: "false_positive", label: "FALSE POSITIVE", color: CLASS_COLOR["FALSE POSITIVE"] }]} />
            ) : stats.error ? <p className="text-sm text-muted-foreground">Unavailable.</p>
              : s ? <EmptyState title="Dataset not processed yet" /> : <LoadingState rows={3} />}
          </Panel>
        </div>
      </div>
    </>
  );
}
