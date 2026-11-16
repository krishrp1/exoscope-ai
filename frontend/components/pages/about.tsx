"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { ProvenanceBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { Disclaimer, Panel } from "@/components/common/panel";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { fmt, fmtInt, fmtPct } from "@/lib/format";

const STEPS: [string, string][] = [
  ["Catalog", "Read the Kaggle KOI table: each row is a transit-like signal with a period, a mid-transit time, a duration and a disposition."],
  ["Light curves", "Download the Kepler long-cadence PDCSAP light curve of each sampled star from NASA's MAST archive. Keep cadences with a clean quality flag."],
  ["Clean and segment", "Drop missing values, sort by time, and split the series at data gaps and quarter boundaries."],
  ["Detrend", "Divide each segment by a moving median several transit durations wide. Slow stellar and instrumental drifts go; short dips stay."],
  ["Clip and fold", "Remove upward outliers only, then fold the series on the signal's period so every transit lines up at phase zero."],
  ["Bin into two views", "Median-bin into a 256-bin global view (the whole orbit) and a 256-bin local view (a zoom on the transit). Scale each to median 0, depth -1."],
  ["Classify", "Standardize with statistics from the training split, then run the 1D CNN. It outputs a softmax score for CONFIRMED and FALSE POSITIVE."],
  ["Explain and report", "Compute saliency, Integrated Gradients and occlusion for the predicted class, and return the result with per-stage timings."],
];

const STACK: [string, string][] = [
  ["Model", "TensorFlow / Keras 1D CNN"],
  ["Science stack", "NumPy, Pandas, SciPy, scikit-learn, Astropy"],
  ["Backend", "FastAPI, Pydantic, WebSocket training stream"],
  ["Frontend", "Next.js App Router, TypeScript, Tailwind, shadcn/ui"],
  ["Charts", "Plotly.js for scientific plots, Recharts for analytics"],
  ["Motion and icons", "Framer Motion, Lucide"],
];

function FlowBox({ title, children, tone = "default" }: { title: string; children?: ReactNode; tone?: "default" | "primary" | "violet" }) {
  const border = { default: "border-border", primary: "border-primary/50", violet: "border-accent-violet/50" }[tone];
  return (
    <div className={`rounded-lg border ${border} bg-background-secondary/70 px-3 py-2.5 text-center`}>
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="data mt-0.5 text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}

function Arrow({ vertical = false }: { vertical?: boolean }) {
  const Icon = vertical ? ArrowDown : ArrowRight;
  return <Icon className={`mx-auto size-4 shrink-0 text-muted-foreground ${vertical ? "" : "max-lg:rotate-90"}`} aria-hidden="true" />;
}

function Flow({ children, label }: { children: ReactNode; label: string }) {
  return <div role="img" aria-label={label} className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">{children}</div>;
}

export function AboutPage() {
  const stats = useApi(api.datasetStats);
  const model = useApi(api.modelStatus);
  const s = stats.data;
  const m = model.data;
  const arch = m?.architecture;
  const live = (value: string | null | undefined) => value ?? "(start the backend to see this figure)";

  return (
    <>
      <PageHeader title="About & Methodology"
                  description="How ExoScope AI works end to end, where its data comes from, and what it cannot do. Written to be talked through." />

      <div className="space-y-5">
        <Panel title="What this is">
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              ExoScope AI classifies transit-like signals found by NASA&apos;s Kepler telescope as <span className="text-foreground">CONFIRMED</span> planet
              or <span className="text-foreground">FALSE POSITIVE</span>, using a small 1D convolutional network trained on real Kepler light curves.
              It is a learning and portfolio project.
            </p>
            <p>
              It takes a signal that is already known (with a period and timing from the catalog) and scores its shape. It does not search
              raw light curves for new planets, and it has not discovered any.
            </p>
          </div>
        </Panel>

        <Panel title="The pipeline in eight steps">
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="rounded-lg border border-border p-3.5">
                <span className="data text-xs text-primary">STEP {i + 1}</span>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Data pipeline" description="From two sources to one model input">
            <Flow label="Data pipeline diagram: the Kaggle KOI catalog and MAST light curves are joined by star, preprocessed into two folded views, and split by star into training, validation and test sets">
              <div className="flex flex-1 flex-col gap-2">
                <FlowBox title="Kaggle KOI catalog" tone="primary">{s ? `${fmtInt(s.catalog.n_koi)} signals` : "labels, ephemerides"}</FlowBox>
                <FlowBox title="MAST light curves" tone="violet">{s ? `${fmtInt(s.light_curves.n_targets_available)} stars` : "Kepler PDCSAP flux"}</FlowBox>
              </div>
              <Arrow />
              <div className="flex-1"><FlowBox title="Join by star (KIC id)">{s ? `${fmtInt(s.light_curves.n_koi_available)} signals with a curve` : "one curve, many signals"}</FlowBox></div>
              <Arrow />
              <div className="flex-1"><FlowBox title="Detrend, fold, bin">2 views x 256 bins</FlowBox></div>
              <Arrow />
              <div className="flex-1"><FlowBox title="Split by star">{s?.splits?.train ? `${fmtInt(s.splits.train.n_samples)} / ${fmtInt(s.splits.val.n_samples)} / ${fmtInt(s.splits.test.n_samples)}` : "train / val / test"}</FlowBox></div>
            </Flow>
            <div className="mt-4 flex flex-wrap gap-2">
              <ProvenanceBadge kind="kaggle" />
              <ProvenanceBadge kind="mast" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Splitting by star, not by signal, keeps every signal of a multi-planet system in one split, so the model is never tested on a star it trained on.
              No synthetic data is used for training or evaluation.
            </p>
          </Panel>

          <Panel title="ML workflow" description="How a model is produced and served">
            <Flow label="ML workflow diagram: fit normalization on the training split, train with class weights and augmentation, select the checkpoint on validation loss, evaluate once on the test split, save artifacts, serve">
              {["Fit standardizer on train only", "Train: Adam, class weights, augmentation", "Pick checkpoint by validation loss", "Evaluate once on test", "Save artifacts, hot-swap model"]
                .map((label, i, all) => (
                  <div key={label} className="contents">
                    <div className="flex-1"><FlowBox title={label} tone={i === 3 ? "primary" : "default"} /></div>
                    {i < all.length - 1 && <Arrow />}
                  </div>
                ))}
            </Flow>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Fixed random seeds; early stopping and learning-rate reduction watch validation loss.</li>
              <li>The decision threshold is the default (highest softmax score). It was not tuned on the test split.</li>
              <li>Training and inference call the same preprocessing function, with the saved configuration.</li>
            </ul>
          </Panel>
        </div>

        <Panel title="Model architecture" description={arch ? `${arch.name} · ${fmtInt(arch.total_params)} parameters · read from the loaded model` : "Read from the loaded model"}>
          {model.error ? <p className="text-sm text-muted-foreground">The architecture table is read from the running backend, which is not reachable right now.</p>
            : !m ? <p className="text-sm text-muted-foreground" role="status">Loading the model description.</p>
            : !arch ? (
              <p className="text-sm text-muted-foreground">
                No model is trained yet. The design is: Conv1D(32, k=5), BatchNorm, ReLU, MaxPool; Conv1D(64, k=5), BatchNorm, ReLU, MaxPool;
                Conv1D(128, k=3), BatchNorm, ReLU; global average pooling; Dense(64); Dropout; softmax over two classes.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Layers of the loaded model with output shape and parameter count</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      {["#", "Layer", "Type", "Output shape", "Parameters"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {arch.layers.map((l, i) => (
                      <tr key={l.name} className="border-b border-border/50">
                        <td className="data px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="data px-3 py-1.5">{l.name}</td>
                        <td className="px-3 py-1.5">{l.type}</td>
                        <td className="data px-3 py-1.5 text-muted-foreground">({l.output_shape.join(", ")})</td>
                        <td className="data px-3 py-1.5 text-right">{fmtInt(l.params)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Dataset attribution">
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <ProvenanceBadge kind="kaggle" />
                <p className="mt-1">Kaggle dataset <span className="data text-foreground">arashnic/exoplanets</span>: the NASA Exoplanet Archive&apos;s Kepler Objects of Interest
                  cumulative table. Used for targets, labels (<span className="data">koi_disposition</span>) and transit ephemerides. It contains no light curves.</p>
              </li>
              <li>
                <ProvenanceBadge kind="mast" />
                <p className="mt-1">Kepler long-cadence PDCSAP light curves from the Mikulski Archive for Space Telescopes (MAST), for a seeded random sample of the
                  catalog&apos;s stars. {s ? `${fmtInt(s.light_curves.n_observations_total)} brightness measurements across ${fmtInt(s.light_curves.n_targets_available)} stars.` : ""}</p>
              </li>
              <li>
                <ProvenanceBadge kind="synthetic" />
                <p className="mt-1">Only two places: the animated illustration on the landing page, and the fixtures used by automated tests. Never in training or evaluation.</p>
              </li>
            </ul>
          </Panel>

          <Panel title="Research inspiration">
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The representation (a global and a local phase-folded view fed to a 1D CNN) follows Shallue &amp; Vanderburg (2018),
                &quot;Identifying Exoplanets with Deep Learning&quot;, The Astronomical Journal 155, 94. That work, by Google and UT Austin, identified the planet Kepler-90i.
              </p>
              <p>
                <span className="text-foreground">This project did not discover Kepler-90i or any other planet.</span> It is an independent, much smaller
                re-implementation of the idea: a different label set, a smaller sample, a smaller network and a simpler detrending step.
              </p>
            </div>
          </Panel>
        </div>

        <Panel title="Honest limitations">
          <ul className="grid gap-x-8 gap-y-2 text-sm text-muted-foreground md:grid-cols-2">
            {[
              "It classifies known signals. It needs a period and timing; it does not find new signals.",
              "Labels are catalog dispositions. Some will be wrong, and \"confirmed\" includes statistically validated planets.",
              s ? `Trained on ${fmtInt((s.splits.train?.n_samples ?? 0) + (s.splits.val?.n_samples ?? 0) + (s.splits.test?.n_samples ?? 0))} of the catalog's ${fmtInt((s.catalog.labelled_class_counts["CONFIRMED"] ?? 0) + (s.catalog.labelled_class_counts["FALSE POSITIVE"] ?? 0))} resolved signals, a sample.`
                : "Trained on a sample of the catalog, not all of it.",
              "The sample has a higher share of confirmed planets than the full catalog, because all signals on a fetched star are used.",
              "Each view is scaled to the same depth, so absolute transit depth is hidden from the model.",
              "For uploads without a period, the estimated period can be a multiple of the true one, which changes the result.",
              "One training run, one seed, no hyperparameter search: no error bars on the metrics.",
              "A softmax score is not a calibrated probability, and never the probability that an object is a planet.",
              "Attribution maps explain the network's arithmetic. They are not evidence of a physical transit.",
              "Kepler only. Other telescopes have different cadence and noise and were not tested.",
            ].map((text) => <li key={text} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />{text}</li>)}
          </ul>
        </Panel>

        <Panel title="Talking points" description="Design decisions and trade-offs, for a technical conversation">
          <dl className="grid gap-4 md:grid-cols-2">
            {[
              ["Why not train on the Kaggle table directly?", "It has no time series, and columns such as koi_score and the false-positive flags are outputs of earlier vetting, so a tabular model would mostly copy the label."],
              ["Why fold instead of feeding the raw series?", "A transit is a few hours in a four-year record. Folding stacks hundreds of transits into one high signal-to-noise shape of fixed length."],
              ["How is leakage prevented?", "The split is by star. The standardizer is fitted on the training split only. Augmentation and class weights touch training data only. Tests assert each of these."],
              ["Why report PR-AUC and recall first?", m?.summary?.accuracy != null ? `Classes are imbalanced. Accuracy is ${fmtPct(m.summary.accuracy)}, but recall of ${fmtPct(m.summary.recall)} and precision of ${fmtPct(m.summary.precision)} on the planet class say more about usefulness.` : "Classes are imbalanced, so accuracy alone overstates usefulness."],
              ["What would come next?", "Use all catalog stars, keep depth as an extra input, add a spline detrender with in-transit masking, calibrate the scores, and repeat training over several seeds for error bars."],
              ["What is real here?", `Every number in this app is read from the backend. ${live(s ? `${fmtInt(s.light_curves.n_observations_total)} measurements are genuine Kepler data` : null)}; training progress is streamed from the actual training loop.`],
            ].map(([q, a]) => (
              <div key={q} className="rounded-lg border border-border p-3.5">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Technology stack">
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
            {STACK.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {m?.trained && m.preprocessing && (
            <p className="data mt-3 text-xs text-muted-foreground">
              Preprocessing in use: {m.preprocessing.n_bins} bins per view · local view ±{fmt(m.preprocessing.local_half_width_durations, 0)} durations ·
              detrend window {fmt(m.preprocessing.detrend_window_durations, 0)} durations ({fmt(m.preprocessing.detrend_min_window_days, 0)} to {fmt(m.preprocessing.detrend_max_window_days, 0)} d) ·
              upper clip {fmt(m.preprocessing.clip_sigma_upper, 0)}σ · standardizer fitted on {fmtInt(m.standardizer?.n_fit_samples)} training signals
            </p>
          )}
        </Panel>

        <Disclaimer>
          ExoScope AI is not affiliated with NASA. Kepler data are public and provided by NASA through MAST and the NASA Exoplanet Archive.
        </Disclaimer>
      </div>
    </>
  );
}
