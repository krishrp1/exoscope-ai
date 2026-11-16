"use client";

import { useMemo } from "react";
import type { Data, Layout, Shape } from "plotly.js";

import { Plot, PLOT_COLORS } from "@/components/charts/plot";
import type { SampleDetail } from "@/types/api";

const MAX_SHAPES = 400; // Plotly slows down with thousands of shapes

/** Time vs flux for one Kepler target, with optional shading of the catalog-predicted transit windows. */
export function LightCurvePlot({ detail, showTransits, height = 420, xRange, onXRange, color = PLOT_COLORS.cyan }: {
  detail: SampleDetail;
  showTransits: boolean;
  height?: number;
  xRange?: [number, number] | null;
  onXRange?: (range: [number, number] | null) => void;
  color?: string;
}) {
  const { lightcurve, transits } = detail;
  const data = useMemo<Data[]>(
    () => [{
      type: "scattergl", mode: "markers", x: lightcurve.time, y: lightcurve.flux,
      marker: { size: 2.5, color, opacity: 0.8 }, name: detail.sample.kepoi_name,
      hovertemplate: "t = %{x:.4f} d<br>flux = %{y:.6~g}<extra></extra>",
    }],
    [lightcurve, color, detail.sample.kepoi_name],
  );

  const shapes = useMemo<Partial<Shape>[]>(() => {
    if (!showTransits) return [];
    const half = transits.duration_hours / 48;
    let times = transits.times;
    if (xRange) times = times.filter((t) => t >= xRange[0] - half && t <= xRange[1] + half);
    if (times.length > MAX_SHAPES) return [];
    return times.map((t) => ({
      type: "rect", xref: "x", yref: "paper", x0: t - half, x1: t + half, y0: 0, y1: 1,
      fillcolor: "rgba(167,139,250,0.22)", line: { width: 0 }, layer: "below",
    }));
  }, [showTransits, transits, xRange]);

  const layout = useMemo<Partial<Layout>>(
    () => ({
      xaxis: { title: { text: `time (${lightcurve.time_unit})` }, range: xRange ?? undefined, autorange: xRange ? false : true },
      yaxis: { title: { text: lightcurve.flux_unit }, tickformat: lightcurve.mode === "raw" ? "~s" : ".4f" },
      shapes,
      showlegend: false,
      uirevision: detail.sample.kepoi_name + lightcurve.mode,
    }),
    [lightcurve, shapes, xRange, detail.sample.kepoi_name],
  );

  return (
    <Plot data={data} layout={layout} height={height}
          ariaLabel={`Light curve of ${detail.sample.kepoi_name}: ${lightcurve.n_returned} points of ${lightcurve.flux_unit} against time`}
          config={{ scrollZoom: true }}
          onRelayout={(e) => {
            if (!onXRange) return;
            const a = e["xaxis.range[0]"], b = e["xaxis.range[1]"];
            if (typeof a === "number" && typeof b === "number") onXRange([a, b]);
            else if (e["xaxis.autorange"]) onXRange(null);
          }} />
  );
}

export function tooManyTransitsToShade(detail: SampleDetail, xRange: [number, number] | null | undefined): boolean {
  const half = detail.transits.duration_hours / 48;
  const times = xRange ? detail.transits.times.filter((t) => t >= xRange[0] - half && t <= xRange[1] + half) : detail.transits.times;
  return times.length > MAX_SHAPES;
}
