"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

import { DispositionBadge, ProvenanceBadge } from "@/components/common/badges";
import { Disclaimer, KeyValue, Panel } from "@/components/common/panel";
import { Segmented } from "@/components/common/toggle";
import { ViewsPlot } from "@/components/charts/views-plot";
import { AnalysisStages } from "@/components/predict/stages";
import { CLASS_COLOR, fmt, fmtInt, SPLIT_LABEL, PALETTE } from "@/lib/format";
import type { Explanation, Prediction } from "@/types/api";

export const METHOD_SHORT: Record<string, string> = {
  integrated_gradients: "Integrated Gradients",
  saliency: "Saliency",
  occlusion: "Occlusion",
};

export function ProbabilityBars({ probabilities }: { probabilities: Record<string, number> }) {
  return (
    <ul className="space-y-2" aria-label="Softmax score per class">
      {Object.entries(probabilities).map(([name, p]) => (
        <li key={name}>
          <div className="flex items-baseline justify-between text-sm">
            <span>{name}</span>
            <span className="data">{fmt(p, 4)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: CLASS_COLOR[name] ?? PALETTE.primary }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ExplanationControls({ explanation, method, onChange }: {
  explanation: Explanation; method: string; onChange: (method: string) => void;
}) {
  const options = [{ value: "none", label: "Off" },
                   ...Object.keys(explanation.methods).map((m) => ({ value: m, label: METHOD_SHORT[m] ?? m }))];
  return <Segmented label="Explanation overlay" value={method} options={options} onChange={onChange} />;
}

export function PredictionResult({ result }: { result: Prediction }) {
  const reduce = useReducedMotion();
  const [method, setMethod] = useState("integrated_gradients");
  const src = result.source;
  const exp = result.explanation;
  const active = exp && method !== "none" ? exp.methods[method] : null;
  const estimated = result.ephemeris.source === "estimated";
  const provenance = src.type === "dataset_sample" ? "mast" : "user";

  return (
    <motion.div className="space-y-6" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Result" actions={<ProvenanceBadge kind={provenance} />}>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Predicted class</p>
          <p className="mt-1 text-3xl font-semibold" style={{ color: CLASS_COLOR[result.predicted_class] }}>
            {result.predicted_class}
          </p>
          <p className="data mt-1 text-sm text-muted-foreground">
            Model confidence (softmax score): <span className="text-foreground">{fmt(result.confidence, 4)}</span>
          </p>
          <div className="mt-4"><ProbabilityBars probabilities={result.probabilities} /></div>
          <Disclaimer className="mt-4">{result.disclaimer}</Disclaimer>
          {result.warnings.map((w) => (
            <p key={w} role="alert" className="mt-3 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>{w}</span>
            </p>
          ))}

          {src.type === "dataset_sample" && (
            <div className="mt-4 rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Dataset label:</span>
                <DispositionBadge value={src.dataset_label} />
                {src.agrees_with_label === true && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-4" aria-hidden="true" /> Model agrees</span>}
                {src.agrees_with_label === false && <span className="inline-flex items-center gap-1 text-warning"><XCircle className="size-4" aria-hidden="true" /> Model disagrees</span>}
              </div>
              {!src.label_is_resolved && <p className="mt-2 text-xs text-muted-foreground">This signal is an unresolved CANDIDATE, so there is no label to compare with.</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                Split: {SPLIT_LABEL[src.split ?? ""] ?? src.split}.
                {src.seen_in_training ? " The model saw this signal during training, so this is not an independent test." : ""}
              </p>
            </div>
          )}
          {src.type !== "dataset_sample" && (
            <p className="mt-4 text-xs text-muted-foreground">
              This light curve was supplied by the user. Its origin is not verified, and there is no dataset label to compare with.
            </p>
          )}
        </Panel>

        <Panel title="Processing" description="What the backend did with this signal">
          <AnalysisStages running={false} processing={result.processing} />
          <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ephemeris used for folding</h3>
          <KeyValue columns={2} items={[
            ["Period", `${fmt(result.ephemeris.period, 5)} d`],
            ["Mid-transit time", fmt(result.ephemeris.t0, 4)],
            ["Duration", `${fmt(result.ephemeris.duration_hours, 2)} h`],
            ["Source", estimated ? "Estimated (BLS)" : result.ephemeris.source === "provided" ? "Provided by user" : result.ephemeris.source],
          ]} />
          {estimated && (
            <p role="note" className="mt-3 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                No period was given, so it was estimated with a Box Least Squares search (BLS signal-to-noise {fmt(result.ephemeris.bls_snr, 1)}).
                {" "}{result.ephemeris.note} The search can lock onto a multiple of the true period.
              </span>
            </p>
          )}
          {result.upload && (
            <>
              <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Uploaded file</h3>
              <KeyValue columns={2} items={[
                ["File", result.upload.filename],
                ["Rows", fmtInt(result.upload.n_rows)],
                ["Header row", result.upload.has_header ? "yes" : "none found; columns were numbered"],
                ["Time column", result.upload.time_column ?? "none"],
                ["Flux column", result.upload.flux_column],
                ["Rows with missing values", fmtInt(result.upload.n_rows_with_missing_values)],
                ["Time axis", result.upload.time_axis],
              ]} />
              <p className="mt-2 text-xs text-muted-foreground">Missing values: {result.upload.missing_value_handling}.</p>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Processed signal and explanation"
             description="The two curves the network actually saw. Purple bars show the selected attribution in relative units."
             actions={exp ? <ExplanationControls explanation={exp} method={method} onChange={setMethod} /> : undefined}>
        <ViewsPlot height={320} ariaLabel="Model input: global and local folded views, with the selected attribution overlaid"
                   series={[{ name: src.name, views: result.processed, color: CLASS_COLOR[result.predicted_class] }]}
                   attribution={active ? { global: active.global, local: active.local } : null}
                   attributionLabel={active ? METHOD_SHORT[method] : undefined} />
        {exp && (
          <div className="mt-3 space-y-2">
            {active && <p className="text-xs text-muted-foreground"><span className="text-foreground">{active.label}.</span> Computed for the class {exp.target_class}.</p>}
            <Disclaimer>{exp.disclaimer}</Disclaimer>
          </div>
        )}
      </Panel>

      <Panel title="Signal characteristics" description="Measured from the light curve during preprocessing">
        <KeyValue columns={3} items={[
          ["Observations received", fmtInt(result.signal.n_input)],
          ["Observations used", fmtInt(result.signal.n_used)],
          ["Missing values dropped", fmtInt(result.signal.n_missing_dropped)],
          ["Outliers clipped", fmtInt(result.signal.n_outliers_clipped)],
          ["Segments", fmtInt(result.signal.n_segments)],
          ["Time span", `${fmt(result.signal.time_span_days, 1)} d`],
          ["Transits observed", fmtInt(result.signal.n_transits_observed)],
          ["In-transit points", fmtInt(result.signal.n_in_transit_points)],
          ["Measured depth", `${fmt(result.signal.measured_depth_ppm, 0)} ppm`],
          ["Out-of-transit scatter", `${fmt(result.signal.out_of_transit_scatter_ppm, 0)} ppm`],
          ["Empty bins (global / local)", `${result.signal.global_empty_bins} / ${result.signal.local_empty_bins}`],
          ["Local view half-width", `${fmt(result.signal.local_half_width_hours, 1)} h`],
        ]} />
      </Panel>
    </motion.div>
  );
}
