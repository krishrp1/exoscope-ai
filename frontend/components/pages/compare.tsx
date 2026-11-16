"use client";

import { Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DispositionBadge, ProvenanceBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { Disclaimer, Panel } from "@/components/common/panel";
import { SamplePicker } from "@/components/common/sample-picker";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Segmented } from "@/components/common/toggle";
import { ViewsPlot, type ViewRanges } from "@/components/charts/views-plot";
import { METHOD_SHORT } from "@/components/predict/prediction-result";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAction, useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { CLASS_COLOR, fmt, SPLIT_LABEL } from "@/lib/format";
import type { BatchItem, Sample } from "@/types/api";

const MAX_SIGNALS = 4;
const SERIES_COLORS = ["#38bdf8", "#a78bfa", "#4ade80", "#fbbf24"];
type Layout = "side" | "shared";

export function ComparePage() {
  const [selected, setSelected] = useState<Sample[]>([]);
  const [layout, setLayout] = useState<Layout>("side");
  const [method, setMethod] = useState("none");
  const [ranges, setRanges] = useState<ViewRanges>({});
  const [notice, setNotice] = useState<string | null>(null);
  const ids = selected.map((s) => s.id);
  const batch = useApi(() => api.predictBatch(ids, true), [ids.join(",")], ids.length >= 2);
  const example = useAction(async (disposition: string) => api.samples({ disposition, split: "test", page_size: 25 }));

  const add = (s: Sample) => {
    setNotice(null);
    setSelected((cur) => {
      if (cur.some((x) => x.id === s.id)) return cur.filter((x) => x.id !== s.id);
      if (cur.length >= MAX_SIGNALS) {
        setNotice(`Up to ${MAX_SIGNALS} signals can be compared at once. Remove one first.`);
        return cur;
      }
      return [...cur, s];
    });
  };
  const addExample = async (disposition: string) => {
    const list = await example.run(disposition);
    const next = list?.items.find((s) => !ids.includes(s.id));
    if (next) add(next);
    else if (list) setNotice(`No more ${disposition} test examples to add.`);
  };

  const results: BatchItem[] = ids.length >= 2 && batch.data ? batch.data.results.filter((r) => ids.includes(r.sample_id)) : [];
  const ok = results.filter((r) => r.ok && r.processed);
  const ready = ok.length === ids.length && ids.length >= 2;

  return (
    <>
      <PageHeader title="Compare Signals"
                  description="Put two to four dataset signals next to each other: their folded shapes, the model's score for each, and what drove it."
                  actions={<ProvenanceBadge kind="mast" />} />

      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <div className="space-y-5">
          <Panel title="Add signals" description={`${selected.length} of ${MAX_SIGNALS} selected`}>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={example.loading} onClick={() => void addExample("CONFIRMED")}>
                <Plus aria-hidden="true" /> Confirmed example
              </Button>
              <Button variant="outline" size="sm" disabled={example.loading} onClick={() => void addExample("FALSE POSITIVE")}>
                <Plus aria-hidden="true" /> False-positive example
              </Button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Examples are real signals from the held-out test split, taken in catalog order. False positives in this catalog
              include eclipsing binaries and other non-planet signals; the catalog does not say which kind each one is.
            </p>
            {example.error && <ErrorState className="mb-3" message={example.error.message} />}
            {notice && <p role="status" className="mb-3 text-xs text-warning">{notice}</p>}
            <SamplePicker selectedIds={ids} onSelect={add} pageSize={6} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Selection"
                 actions={selected.length > 0 ? <Button variant="ghost" size="sm" onClick={() => { setSelected([]); setRanges({}); }}>Clear all</Button> : undefined}>
            {selected.length === 0 ? (
              <EmptyState title="Nothing to compare yet" message="Add at least two signals from the list, or use the example buttons." />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {selected.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-full border border-border py-1 pr-1 pl-3 text-sm">
                    <span className="size-2.5 rounded-full" style={{ background: SERIES_COLORS[i] }} aria-hidden="true" />
                    <span className="data">{s.kepoi_name}</span>
                    <DispositionBadge value={s.koi_disposition} />
                    <button type="button" onClick={() => add(s)} aria-label={`Remove ${s.kepoi_name}`}
                            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected.length === 1 && <p className="mt-3 text-sm text-muted-foreground">Add one more signal to start the comparison.</p>}
          </Panel>

          {ids.length >= 2 && (
            batch.error ? (
              batch.error.code === "model_not_trained" ? (
                <EmptyState title="No trained model yet" message="Comparison shows model scores, so it needs a trained model."
                            action={<Link href="/observatory/training" className={buttonVariants()}>Open the Training Monitor</Link>} />
              ) : <ErrorState title="The comparison failed" message={batch.error.message} onRetry={batch.refetch} />
            ) : !ready && batch.loading ? <Panel><LoadingState label="Processing and classifying the selected signals" rows={4} /></Panel>
            : (
              <>
                {results.filter((r) => !r.ok).map((r) => (
                  <ErrorState key={r.sample_id} title={`${r.sample_id} could not be processed`} message={r.error?.message ?? "Unknown error"} />
                ))}
                <Panel title="Folded views"
                       description={layout === "side" ? "One plot per signal. Zooming one plot zooms the others to the same range."
                                                      : "All signals on shared axes. Each view is normalized the same way: median 0, deepest bin −1."}
                       actions={
                         <>
                           <Segmented label="Layout" value={layout} onChange={setLayout}
                                      options={[{ value: "side", label: "Side by side" }, { value: "shared", label: "Shared axes" }]} />
                           <Button variant="outline" size="sm" onClick={() => setRanges({})} disabled={!ranges.global && !ranges.local}>
                             <RotateCcw aria-hidden="true" /> Reset zoom
                           </Button>
                         </>
                       }>
                  <div className={batch.loading ? "opacity-60" : undefined} aria-busy={batch.loading}>
                    {layout === "shared" ? (
                      <ViewsPlot height={380} ranges={ranges} onRanges={setRanges}
                                 ariaLabel={`Overlaid folded views of ${ok.map((r) => r.sample_id).join(", ")}`}
                                 series={ok.map((r) => ({ name: r.sample_id, views: r.processed!, color: SERIES_COLORS[ids.indexOf(r.sample_id)] }))} />
                    ) : (
                      <>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Explanation overlay</span>
                          <Segmented label="Explanation overlay" value={method} onChange={setMethod}
                                     options={[{ value: "none", label: "Off" },
                                               ...Object.entries(METHOD_SHORT).map(([value, label]) => ({ value, label }))]} />
                        </div>
                        <div className="grid gap-4 2xl:grid-cols-2">
                          {ok.map((r) => {
                            const exp = method !== "none" ? r.explanation?.methods[method] : null;
                            return (
                              <article key={r.sample_id} className="rounded-xl border border-border p-3">
                                <header className="flex flex-wrap items-center justify-between gap-2">
                                  <h3 className="data flex items-center gap-2 text-sm font-medium">
                                    <span className="size-2.5 rounded-full" style={{ background: SERIES_COLORS[ids.indexOf(r.sample_id)] }} aria-hidden="true" />
                                    {r.sample_id}
                                  </h3>
                                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                    Dataset label <DispositionBadge value={r.source?.dataset_label} />
                                  </span>
                                </header>
                                <ViewsPlot height={230} ranges={ranges} onRanges={setRanges}
                                           ariaLabel={`Folded views of ${r.sample_id}${exp ? ` with ${METHOD_SHORT[method]} attribution` : ""}`}
                                           series={[{ name: r.sample_id, views: r.processed!, color: SERIES_COLORS[ids.indexOf(r.sample_id)] }]}
                                           attribution={exp ? { global: exp.global, local: exp.local } : null}
                                           attributionLabel={exp ? METHOD_SHORT[method] : undefined} />
                              </article>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </Panel>

                <Panel title="Model output per signal" bodyClassName="p-0 sm:p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Dataset label, model prediction and score for each compared signal</caption>
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          {["Signal", "Dataset label", "Model prediction", "Confidence (softmax)", "Score for CONFIRMED", "Agrees", "Split", "Period (d)", "Measured depth (ppm)"]
                            .map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium first:pl-5">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {ok.map((r) => (
                          <tr key={r.sample_id} className="border-b border-border/60">
                            <td className="data px-3 py-2 pl-5 font-medium">{r.sample_id}</td>
                            <td className="px-3 py-2"><DispositionBadge value={r.source?.dataset_label} /></td>
                            <td className="px-3 py-2 font-medium" style={{ color: CLASS_COLOR[r.predicted_class ?? ""] }}>{r.predicted_class}</td>
                            <td className="data px-3 py-2">{fmt(r.confidence, 4)}</td>
                            <td className="data px-3 py-2">{fmt(r.probabilities?.["CONFIRMED"], 4)}</td>
                            <td className="px-3 py-2">{r.source?.agrees_with_label === null || r.source?.agrees_with_label === undefined ? "no label" : r.source.agrees_with_label ? "yes" : "no"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{SPLIT_LABEL[r.source?.split ?? ""] ?? r.source?.split}</td>
                            <td className="data px-3 py-2">{fmt(r.ephemeris?.period, 4)}</td>
                            <td className="data px-3 py-2">{fmt(r.signal?.measured_depth_ppm, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <Disclaimer>
                  Confidence is the model&apos;s softmax score, not the probability that an object is a confirmed planet.
                  Attribution overlays explain the model&apos;s behaviour; they are not physical transit detections.
                  Signals from the training split were seen by the model during training.
                </Disclaimer>
              </>
            )
          )}
        </div>
      </div>
    </>
  );
}
