"use client";

import { Radar, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { DispositionBadge, ProvenanceBadge, SplitBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { KeyValue, Panel } from "@/components/common/panel";
import { SamplePicker } from "@/components/common/sample-picker";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Check, Segmented } from "@/components/common/toggle";
import { LightCurvePlot, tooManyTransitsToShade } from "@/components/charts/lightcurve-plot";
import { ViewsPlot } from "@/components/charts/views-plot";
import { Button, buttonVariants } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { CLASS_COLOR, fmt, fmtInt } from "@/lib/format";

type Mode = "raw" | "normalized";

export function LightCurvesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = params.get("id");
  const [mode, setMode] = useState<Mode>("raw");
  const [showTransits, setShowTransits] = useState(true);
  const [allPoints, setAllPoints] = useState(false);
  // The zoom range belongs to one signal; switching signals drops it.
  const [zoom, setZoom] = useState<{ id: string | null; range: [number, number] | null }>({ id: null, range: null });
  const xRange = zoom.id === id ? zoom.range : null;
  const setXRange = (range: [number, number] | null) => setZoom({ id, range });
  const [resetKey, setResetKey] = useState(0);

  // With no id in the URL, open the first test-split sample so the page is never blank.
  const first = useApi(() => api.samples({ split: "test", page_size: 1 }), [], !id);
  useEffect(() => {
    const firstId = first.data?.items[0]?.id;
    if (!id && firstId) router.replace(`${pathname}?id=${encodeURIComponent(firstId)}`);
  }, [id, first.data, router, pathname]);

  const detail = useApi(() => api.sample(id as string, { mode, max_points: allPoints ? 0 : 20000, include_views: true }),
                        [id, mode, allPoints], !!id);

  const d = detail.data && detail.data.sample.id === id ? detail.data : null;
  const shadeBlocked = d ? showTransits && tooManyTransitsToShade(d, xRange) : false;

  return (
    <>
      <PageHeader title="Light Curve Explorer"
                  description="Brightness over time for a Kepler target. Zoom by dragging, pan with the toolbar, scroll to zoom, double-click to reset."
                  actions={<ProvenanceBadge kind="mast" />} />

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <Panel title="Choose a signal" description="Dataset samples with a fetched light curve">
          <SamplePicker selectedIds={id ? [id] : []}
                        onSelect={(s) => router.replace(`${pathname}?id=${encodeURIComponent(s.id)}`)} />
        </Panel>

        <div className="min-w-0 space-y-6">
          {!id && first.error ? <ErrorState message={first.error.message} onRetry={first.refetch} />
            : !id && first.data && first.data.items.length === 0 ? <EmptyState title="No light curves available" message="Fetch light curves first (scripts/setup_data.sh)." />
            : detail.error ? <ErrorState title="This light curve could not be loaded" message={detail.error.message} onRetry={detail.refetch} />
            : !d ? <Panel><LoadingState label="Loading light curve" rows={5} /></Panel>
            : (
              <>
                <Panel title={`${d.sample.kepoi_name} · ${d.metadata.target_id}`}
                       description={d.sample.kepler_name ?? "No Kepler planet name"}
                       actions={<><DispositionBadge value={d.metadata.dataset_label} /><SplitBadge value={d.metadata.split} /></>}>
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Segmented label="Flux scale" value={mode} onChange={setMode}
                               options={[{ value: "raw", label: "Raw" }, { value: "normalized", label: "Normalized" }]} />
                    <Check id="lc-transits" label="Highlight predicted transits" checked={showTransits} onChange={setShowTransits} />
                    <Check id="lc-all" label="Load every observation" checked={allPoints} onChange={setAllPoints} />
                    <Button variant="outline" size="sm" onClick={() => { setXRange(null); setResetKey((k) => k + 1); }}>
                      <RotateCcw aria-hidden="true" /> Reset view
                    </Button>
                  </div>
                  <div className={detail.loading ? "opacity-60" : undefined} aria-busy={detail.loading}>
                    <LightCurvePlot key={`${d.sample.id}-${resetKey}`} detail={d} showTransits={showTransits} xRange={xRange}
                                    onXRange={setXRange} color={CLASS_COLOR[d.sample.koi_disposition]} />
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p className="data">
                      Showing {fmtInt(d.lightcurve.n_returned)} of {fmtInt(d.lightcurve.n_total)} observations
                      {d.lightcurve.decimated ? " (evenly thinned for display; tick \"Load every observation\" for all of them)." : "."}
                    </p>
                    {showTransits && (
                      <p>
                        Shaded bands mark where transits are <em>predicted</em> by the Kaggle catalog ephemeris
                        ({fmtInt(d.transits.n_total)} over this light curve). They are not detections made by this app.
                        {shadeBlocked && " There are too many in the current view to draw; zoom in to see them."}
                      </p>
                    )}
                    {mode === "normalized" && <p>Normalized: each segment divided by its moving median (the same detrending the model uses), baseline 1.0.</p>}
                  </div>
                </Panel>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel title="Metadata">
                    <KeyValue columns={1} items={[
                      ["Target ID", d.metadata.target_id],
                      ["Signal", d.metadata.koi_name],
                      ["Dataset label", d.metadata.dataset_label],
                      ["Observation count", fmtInt(d.metadata.observation_count)],
                      ["Duration", `${fmt(d.metadata.duration_days, 1)} days`],
                      ["Time range (BKJD)", `${fmt(d.metadata.time_range[0], 2)} to ${fmt(d.metadata.time_range[1], 2)}`],
                      ["Flux range (e⁻/s)", `${fmt(d.metadata.flux_range[0], 0)} to ${fmt(d.metadata.flux_range[1], 0)}`],
                      ["Quarters", String(d.metadata.n_quarters)],
                      ["Median cadence", `${fmt(d.metadata.median_cadence_minutes, 2)} min`],
                      ["Period (catalog)", `${fmt(d.transits.period_days, 5)} d`],
                      ["Transit duration (catalog)", `${fmt(d.transits.duration_hours, 2)} h`],
                    ]} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ProvenanceBadge kind="mast" />
                      <ProvenanceBadge kind="kaggle" />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Flux and time: Kepler via MAST. Label, period and duration: Kaggle KOI catalog.</p>
                  </Panel>

                  <Panel title="Folded views" description="All orbits stacked on the catalog period. These two curves are the model input."
                         actions={<Link href={`/observatory/detect?id=${encodeURIComponent(d.sample.id)}`} className={buttonVariants({ size: "sm" })}>
                           <Radar aria-hidden="true" /> Classify
                         </Link>}>
                    {d.views ? (
                      <>
                        <ViewsPlot height={250} ariaLabel={`Folded global and local views of ${d.sample.kepoi_name}`}
                                   series={[{ name: d.sample.kepoi_name, views: d.views, color: CLASS_COLOR[d.sample.koi_disposition] }]} />
                        {d.views.signal && (
                          <p className="data mt-2 text-xs text-muted-foreground">
                            {fmtInt(d.views.signal.n_transits_observed)} transits observed · measured depth {fmt(d.views.signal.measured_depth_ppm, 0)} ppm ·
                            scatter {fmt(d.views.signal.out_of_transit_scatter_ppm, 0)} ppm · {fmtInt(d.views.signal.n_outliers_clipped)} outliers clipped
                          </p>
                        )}
                      </>
                    ) : <EmptyState title="This light curve cannot be folded" message={d.processing_error ?? undefined} />}
                  </Panel>
                </div>
              </>
            )}
        </div>
      </div>
    </>
  );
}
