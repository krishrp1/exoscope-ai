"use client";

import dynamic from "next/dynamic";
import { memo, useMemo } from "react";
import type { Config, Data, Layout } from "plotly.js";
import type { PlotParams } from "react-plotly.js";

import { Skeleton } from "@/components/ui/skeleton";

// Plotly is large, so it is loaded only in the browser and only on pages that draw a plot.
const PlotInner = dynamic(() => import("./plot-inner"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-48 w-full" />,
});

const AXIS = {
  gridcolor: "rgba(148,163,184,0.12)",
  zerolinecolor: "rgba(148,163,184,0.25)",
  linecolor: "rgba(148,163,184,0.3)",
  tickfont: { family: "var(--font-geist-mono), monospace", size: 11, color: "#94a3b8" },
  title: { font: { size: 12, color: "#94a3b8" } },
};

export const PLOT_COLORS = { cyan: "#38bdf8", violet: "#a78bfa", green: "#4ade80", amber: "#fbbf24", red: "#f87171",
                             muted: "#94a3b8" };

export interface PlotProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  height?: number;
  ariaLabel: string;
  onRelayout?: PlotParams["onRelayout"];
  revision?: number;
}

function mergeAxis(axis: Partial<Layout["xaxis"]> | undefined) {
  const title = typeof axis?.title === "string" ? { text: axis.title } : axis?.title;
  return { ...AXIS, ...axis, title: { ...AXIS.title, ...title } };
}

function PlotBase({ data, layout, config, height = 360, ariaLabel, onRelayout, revision }: PlotProps) {
  const merged = useMemo<Partial<Layout>>(() => {
    const out: Partial<Layout> = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(5,8,22,0.55)",
      font: { family: "var(--font-geist-sans), sans-serif", color: "#f8fafc", size: 12 },
      margin: { l: 58, r: 16, t: 16, b: 46 },
      autosize: true,
      hovermode: "closest",
      hoverlabel: { bgcolor: "#0f172a", bordercolor: "#38bdf8", font: { color: "#f8fafc", size: 12 } },
      legend: { orientation: "h", y: 1.12, x: 0, font: { size: 11, color: "#94a3b8" } },
      dragmode: "zoom",
      ...layout,
    };
    const record = out as Record<string, unknown>;
    for (const key of Object.keys({ xaxis: 1, yaxis: 1, ...layout })) {
      if (/^[xy]axis\d*$/.test(key)) record[key] = mergeAxis(record[key] as Partial<Layout["xaxis"]>);
    }
    return out;
  }, [layout]);

  const mergedConfig = useMemo<Partial<Config>>(
    () => ({ displaylogo: false, responsive: true, scrollZoom: false,
             modeBarButtonsToRemove: ["lasso2d", "toImage"], ...config }),
    [config],
  );

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full">
      <PlotInner data={data} layout={merged} config={mergedConfig} useResizeHandler onRelayout={onRelayout}
                 revision={revision} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export const Plot = memo(PlotBase);
