"use client";

import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";

import { Plot, PLOT_COLORS } from "@/components/charts/plot";
import type { ProcessedViews } from "@/types/api";

export interface ViewSeries {
  name: string;
  views: ProcessedViews;
  color?: string;
}

const SERIES_COLORS = [PLOT_COLORS.cyan, PLOT_COLORS.violet, PLOT_COLORS.green, PLOT_COLORS.amber];

/**
 * The model's two input views side by side: the global view (whole orbit) and the local view
 * (zoom on the transit). Optionally overlays an attribution curve on a second axis.
 */
export type ViewRanges = { global?: [number, number]; local?: [number, number] };

export function ViewsPlot({ series, attribution, attributionLabel, height = 300, ariaLabel, ranges, onRanges }: {
  series: ViewSeries[];
  attribution?: { global: number[]; local: number[] } | null;
  attributionLabel?: string;
  height?: number;
  ariaLabel: string;
  /** Controlled x-ranges, used to keep several plots zoomed together. */
  ranges?: ViewRanges;
  onRanges?: (ranges: ViewRanges) => void;
}) {
  const data = useMemo<Data[]>(() => {
    const traces: Data[] = [];
    series.forEach((s, i) => {
      const color = s.color ?? SERIES_COLORS[i % SERIES_COLORS.length];
      traces.push({
        type: "scatter", mode: "lines", name: s.name, legendgroup: s.name, x: s.views.global_view.phase,
        y: s.views.global_view.flux, line: { color, width: 1.6 }, xaxis: "x", yaxis: "y",
        hovertemplate: "phase %{x:.3f}<br>flux %{y:.3f}<extra>" + s.name + "</extra>",
      });
      traces.push({
        type: "scatter", mode: "lines", name: s.name, legendgroup: s.name, showlegend: false,
        x: s.views.local_view.hours_from_mid_transit, y: s.views.local_view.flux, line: { color, width: 1.6 },
        xaxis: "x2", yaxis: "y2", hovertemplate: "%{x:.2f} h<br>flux %{y:.3f}<extra>" + s.name + "</extra>",
      });
    });
    if (attribution && series.length > 0) {
      const v = series[0].views;
      const common = { type: "bar" as const, marker: { color: "rgba(167,139,250,0.55)" }, hoverinfo: "skip" as const };
      traces.push({ ...common, name: attributionLabel ?? "attribution", x: v.global_view.phase, y: attribution.global,
                    xaxis: "x", yaxis: "y3" });
      traces.push({ ...common, name: attributionLabel ?? "attribution", showlegend: false,
                    x: v.local_view.hours_from_mid_transit, y: attribution.local, xaxis: "x2", yaxis: "y4" });
    }
    return traces;
  }, [series, attribution, attributionLabel]);

  const layout = useMemo<Partial<Layout>>(() => {
    const l: Partial<Layout> = {
      grid: { rows: 1, columns: 2, pattern: "independent" },
      xaxis: { title: { text: "orbital phase (global view)" }, domain: [0, 0.47],
               ...(ranges?.global ? { range: ranges.global, autorange: false } : {}) },
      yaxis: { title: { text: "normalized flux" } },
      xaxis2: { title: { text: "hours from mid-transit (local view)" }, domain: [0.53, 1],
                ...(ranges?.local ? { range: ranges.local, autorange: false } : {}) },
      yaxis2: { anchor: "x2" },
      bargap: 0,
      showlegend: series.length > 1 || !!attribution,
      margin: { l: 52, r: 12, t: 28, b: 44 },
    };
    if (attribution) {
      // Attribution is shown in relative units: tick labels would collide with the neighbouring plot.
      const axis = { overlaying: "y" as const, side: "right" as const, showgrid: false, zeroline: false,
                     showticklabels: false };
      (l as Record<string, unknown>).yaxis3 = { ...axis, anchor: "x" };
      (l as Record<string, unknown>).yaxis4 = { ...axis, overlaying: "y2", anchor: "x2" };
    }
    return l;
  }, [series.length, attribution, ranges]);

  return (
    <Plot data={data} layout={layout} height={height} ariaLabel={ariaLabel}
          onRelayout={onRanges ? (e) => {
            const next: ViewRanges = { ...ranges };
            let changed = false;
            const g0 = e["xaxis.range[0]"], g1 = e["xaxis.range[1]"];
            const l0 = e["xaxis2.range[0]"], l1 = e["xaxis2.range[1]"];
            if (typeof g0 === "number" && typeof g1 === "number") { next.global = [g0, g1]; changed = true; }
            if (typeof l0 === "number" && typeof l1 === "number") { next.local = [l0, l1]; changed = true; }
            if (e["xaxis.autorange"]) { delete next.global; changed = true; }
            if (e["xaxis2.autorange"]) { delete next.local; changed = true; }
            if (changed) onRanges(next);
          } : undefined} />
  );
}
