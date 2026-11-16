"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";

import { ProvenanceBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { Disclaimer, KeyValue, Panel, Stat } from "@/components/common/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ClassBars } from "@/components/charts/class-bars";
import { AccuracyChart, LossChart } from "@/components/charts/history-charts";
import { Plot, PLOT_COLORS } from "@/components/charts/plot";
import { buttonVariants } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { CLASS_COLOR, fmt, fmtDate, fmtDuration, fmtInt, fmtPct } from "@/lib/format";
import type { SplitMetrics } from "@/types/api";

function ConfusionMatrix({ test }: { test: SplitMetrics }) {
  const { labels, matrix } = test.confusion_matrix;
  const max = Math.max(...matrix.flat(), 1);
  const names = [["True negative", "False alarm"], ["Missed planet", "True positive"]];
  return (
    <div>
      <table className="w-full border-separate border-spacing-1.5 text-sm">
        <caption className="sr-only">Confusion matrix on the test set. Rows are the dataset label, columns are the model prediction.</caption>
        <thead>
          <tr>
            <td />
            {labels.map((l) => <th key={l} scope="col" className="pb-1 text-xs font-medium text-muted-foreground">Predicted {l}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th scope="row" className="pr-2 text-right text-xs font-medium text-muted-foreground">Label {labels[i]}</th>
              {row.map((v, j) => (
                <td key={j} className="rounded-lg border border-border p-3 text-center"
                    style={{ background: `rgba(56,189,248,${0.06 + 0.5 * (v / max)})` }}>
                  <span className="data block text-2xl font-semibold">{fmtInt(v)}</span>
                  <span className="block text-xs text-muted-foreground">{names[i][j]}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">{test.confusion_matrix.layout}. {test.decision_rule}.</p>
    </div>
  );
}

function CurvePlot({ x, y, xTitle, yTitle, name, baseline, ariaLabel }: {
  x: number[]; y: number[]; xTitle: string; yTitle: string; name: string;
  baseline: { x: number[]; y: number[]; name: string }; ariaLabel: string;
}) {
  const data = useMemo<Data[]>(() => [
    { type: "scatter", mode: "lines", x, y, name, line: { color: PLOT_COLORS.cyan, width: 2 }, fill: "tozeroy", fillcolor: "rgba(56,189,248,0.08)" },
    { type: "scatter", mode: "lines", x: baseline.x, y: baseline.y, name: baseline.name, line: { color: PLOT_COLORS.muted, width: 1, dash: "dash" } },
  ], [x, y, name, baseline]);
  const layout = useMemo<Partial<Layout>>(() => ({
    xaxis: { title: { text: xTitle }, range: [0, 1] }, yaxis: { title: { text: yTitle }, range: [0, 1.02] },
  }), [xTitle, yTitle]);
  return <Plot data={data} layout={layout} height={300} ariaLabel={ariaLabel} />;
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

export function PerformancePage() {
  const { data, error, loading, refetch } = useApi(api.modelMetrics);
  const status = useApi(api.modelStatus);

  if (error) return (<><PageHeader title="Model Performance" /><ErrorState message={error.message} onRetry={refetch} /></>);
  if (loading && !data) return (<><PageHeader title="Model Performance" /><LoadingState label="Loading evaluation results" rows={5} /></>);
  if (!data?.trained || !data.metrics) {
    return (
      <>
        <PageHeader title="Model Performance" description="Results on the held-out test split." />
        <EmptyState title="No evaluation results yet"
                    message="Metrics are computed on the test split at the end of a training run. Nothing is shown until a run has completed."
                    action={<Link href="/observatory/training" className={buttonVariants()}>Open the Training Monitor</Link>} />
      </>
    );
  }

  const m = data.metrics;
  const t = m.test;
  const v = m.validation;
  const [[, fp], [fn, tp]] = t.confusion_matrix.matrix;
  const arch = status.data?.architecture;
  const baselineAccuracy = Math.max(t.n_negative, t.n_positive) / t.n_samples;
  const gap = data.history ? data.history.accuracy[m.best_epoch - 1] - data.history.val_accuracy[m.best_epoch - 1] : null;

  return (
    <>
      <PageHeader title="Model Performance"
                  description={`Measured on ${fmtInt(t.n_samples)} held-out test signals (${fmtInt(t.n_positive)} confirmed planets) that the model never saw. Trained ${fmtDate(m.trained_at)}.`}
                  actions={<><ProvenanceBadge kind="kaggle" /><ProvenanceBadge kind="mast" /></>} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Recall (confirmed)" value={fmtPct(t.recall)} tone="primary" hint={`${fmtInt(tp)} of ${fmtInt(t.n_positive)} planets found`} />
        <Stat label="Precision (confirmed)" value={fmtPct(t.precision)} tone="primary" hint={`${fmtInt(fp)} false alarms among ${fmtInt(tp + fp)} calls`} />
        <Stat label="F1 (confirmed)" value={fmt(t.f1, 3)} />
        <Stat label="PR-AUC" value={fmt(t.pr_auc, 3)} hint={`chance level ${fmt(t.positive_prevalence, 3)}`} />
        <Stat label="ROC-AUC" value={fmt(t.roc_auc, 3)} hint="chance level 0.500" />
        <Stat label="Accuracy" value={fmtPct(t.accuracy)} hint={`always guessing the larger class: ${fmtPct(baselineAccuracy)}`} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Recall and precision for the planet class come first because the classes are imbalanced; accuracy alone would flatter the model.
        {" "}{data.note}
      </p>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Confusion matrix" description="Test split"><ConfusionMatrix test={t} /></Panel>
        <Panel title="Per-class metrics" description="Test split" bodyClassName="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Precision, recall, F1 and support per class on the test split</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {["Class", "Precision", "Recall", "F1", "Support"].map((h) => <th key={h} scope="col" className="px-4 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(t.per_class).map(([name, c]) => (
                  <tr key={name} className="border-b border-border/60">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium" style={{ color: CLASS_COLOR[name] }}>{name}</th>
                    <td className="data px-4 py-2.5">{fmt(c.precision, 3)}</td>
                    <td className="data px-4 py-2.5">{fmt(c.recall, 3)}</td>
                    <td className="data px-4 py-2.5">{fmt(c.f1, 3)}</td>
                    <td className="data px-4 py-2.5">{fmtInt(c.support)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 sm:p-5">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Validation split, for comparison</h3>
            <KeyValue columns={2} items={[
              ["Recall", fmtPct(v.recall)], ["Precision", fmtPct(v.precision)],
              ["PR-AUC", fmt(v.pr_auc, 3)], ["ROC-AUC", fmt(v.roc_auc, 3)],
              ["Accuracy", fmtPct(v.accuracy)], ["Signals", fmtInt(v.n_samples)],
            ]} />
            <p className="mt-2 text-xs text-muted-foreground">The checkpoint was chosen on validation loss, so validation numbers are slightly optimistic. The test numbers are the ones to quote.</p>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="ROC curve" description={`Test split · area ${fmt(t.roc_auc, 3)}`}>
          {t.roc_curve ? <CurvePlot x={t.roc_curve.fpr} y={t.roc_curve.tpr} xTitle="false positive rate" yTitle="true positive rate (recall)"
                                    name="model" baseline={{ x: [0, 1], y: [0, 1], name: "chance" }}
                                    ariaLabel={`ROC curve on the test split, area under the curve ${fmt(t.roc_auc, 3)}`} />
            : <EmptyState title="ROC curve unavailable" message="The test split has only one class." />}
        </Panel>
        <Panel title="Precision-recall curve" description={`Test split · area ${fmt(t.pr_auc, 3)}`}>
          {t.pr_curve ? <CurvePlot x={t.pr_curve.recall} y={t.pr_curve.precision} xTitle="recall" yTitle="precision" name="model"
                                   baseline={{ x: [0, 1], y: [t.positive_prevalence, t.positive_prevalence], name: "prevalence" }}
                                   ariaLabel={`Precision-recall curve on the test split, area under the curve ${fmt(t.pr_auc, 3)}`} />
            : <EmptyState title="PR curve unavailable" message="The test split has only one class." />}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="Training loss" description={`${m.epochs_run} epochs, best at epoch ${m.best_epoch}`}>
          {data.history ? <LossChart history={data.history} bestEpoch={m.best_epoch} animate /> : <EmptyState title="No history saved" />}
        </Panel>
        <Panel title="Training accuracy" description={m.early_stopped ? "Stopped early when validation loss stopped improving" : "Ran the full epoch budget"}>
          {data.history ? <AccuracyChart history={data.history} bestEpoch={m.best_epoch} animate /> : <EmptyState title="No history saved" />}
        </Panel>
        <Panel title="Class distribution by split" description="Signals used for this run">
          <ClassBars height={220} ariaLabel="Confirmed and false positive counts in the training, validation and test splits of this run"
                     rows={(["train", "val", "test"] as const).map((k) => ({
                       name: { train: "Training", val: "Validation", test: "Test" }[k],
                       confirmed: m.splits[k]?.["CONFIRMED"] ?? 0, false_positive: m.splits[k]?.["FALSE POSITIVE"] ?? 0,
                     }))}
                     series={[{ key: "confirmed", label: "CONFIRMED", color: CLASS_COLOR["CONFIRMED"] },
                              { key: "false_positive", label: "FALSE POSITIVE", color: CLASS_COLOR["FALSE POSITIVE"] }]} />
          <p className="data mt-2 text-xs text-muted-foreground">
            Class weights: CONFIRMED {fmt(m.class_weights["CONFIRMED"], 3)}, FALSE POSITIVE {fmt(m.class_weights["FALSE POSITIVE"], 3)} ·
            training took {fmtDuration(m.duration_seconds)}
          </p>
        </Panel>
      </div>

      <Panel className="mt-5" title="Reading these results">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Note title="Architecture">
            {arch ? `${arch.layers.filter((l) => l.type === "Conv1D").length} convolution blocks, global average pooling and a ${arch.output_shape[0]}-way softmax: ${fmtInt(arch.total_params)} parameters. ` : ""}
            The input is two 256-bin curves: the whole orbit (global view) and a zoom on the transit (local view).
          </Note>
          <Note title="Temporal feature extraction">
            Convolution kernels slide along the folded curve and respond to local shapes such as a flat-bottomed dip or a sharp V.
            Pooling then lets later layers see wider context, for example a second dip half an orbit away.
          </Note>
          <Note title="Overfitting">
            {gap !== null ? `At the chosen epoch, training accuracy is ${fmtPct(Math.abs(gap))} ${gap >= 0 ? "above" : "below"} validation accuracy. ` : ""}
            Dropout, batch normalization, augmentation of training batches and early stopping on validation loss limit overfitting.
            Validation loss still jumps between epochs, so the chosen checkpoint depends on that noise.
          </Note>
          <Note title="Class imbalance">
            {fmtPct(t.positive_prevalence)} of test signals are confirmed planets. Training uses inverse-frequency class weights.
            The test split is left at its natural ratio, and the PR curve is judged against that prevalence.
          </Note>
          <Note title="False positives and misses">
            The model raised {fmtInt(fp)} false alarms and missed {fmtInt(fn)} of {fmtInt(t.n_positive)} confirmed planets at the default threshold.
            Each view is scaled to the same depth, so the model cannot use absolute depth, which is a strong clue for eclipsing binaries.
          </Note>
          <Note title="Limitations">
            One training run with one random seed and no hyperparameter search, so there are no error bars. The model scores a known signal
            folded on a catalog ephemeris; it does not search for new signals. Labels are catalog dispositions, not ground truth.
          </Note>
        </div>
      </Panel>

      <Disclaimer className="mt-5">
        {status.data?.disclaimer ?? "Model scores are softmax outputs, not the probability that an object is a confirmed planet."}
      </Disclaimer>
    </>
  );
}
