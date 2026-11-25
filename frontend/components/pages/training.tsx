"use client";

import { RefreshCw, Square, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { KeyValue, Panel, Stat } from "@/components/common/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { AccuracyChart, LearningRateChart, LossChart } from "@/components/charts/history-charts";
import HoldButton from "@/components/kokonutui/hold-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction, useApi } from "@/hooks/use-api";
import { useTrainingStream } from "@/hooks/use-training-stream";
import { api } from "@/lib/api";
import { fmt, fmtDate, fmtDuration, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TrainingEvent, TrainingState } from "@/types/api";

const STATE_STYLE: Record<TrainingState, string> = {
  idle: "border-border text-muted-foreground",
  running: "border-primary/50 bg-primary/10 text-primary",
  stopping: "border-warning/50 bg-warning/10 text-warning",
  completed: "border-success/50 bg-success/10 text-success",
  stopped: "border-warning/50 bg-warning/10 text-warning",
  failed: "border-destructive/50 bg-destructive/10 text-destructive",
};

function describe(e: TrainingEvent): string {
  switch (e.type) {
    case "status": return e.message ?? "status";
    case "train_begin": return `Training started: up to ${e.epochs} epochs, ${e.steps_per_epoch} batches per epoch`;
    case "epoch_begin": return `Epoch ${e.epoch} of ${e.epochs} started`;
    case "epoch_end":
      return `Epoch ${e.epoch}: loss ${fmt(e.loss, 4)}, accuracy ${fmt(e.accuracy, 4)}, val loss ${fmt(e.val_loss, 4)}, val accuracy ${fmt(e.val_accuracy, 4)}, lr ${e.learning_rate?.toExponential(1)}`;
    case "checkpoint_saved": return `Checkpoint saved at epoch ${e.epoch} (best validation loss so far: ${fmt(e.val_loss, 4)})`;
    case "completed": return `Completed after ${e.epochs_run} epochs; best epoch ${e.best_epoch}; test accuracy ${fmtPct(e.test?.accuracy)}, recall ${fmtPct(e.test?.recall)}`;
    case "model_reloaded": return e.message ?? "New model loaded";
    case "stopped": return e.message ?? "Stopped";
    case "error": return `Error: ${e.message}`;
    case "finished": return `Run finished (${e.state})`;
    default: return e.type;
  }
}

function ProgressBar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="data">{text}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
           className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TrainingPage() {
  const stream = useTrainingStream();
  const saved = useApi(api.trainingHistory);
  const [epochsInput, setEpochs] = useState<string | null>(null); // null = untouched, show the default

  const [batchSize, setBatchSize] = useState("64");
  const [learningRate, setLearningRate] = useState("0.001");
  const health = useApi(api.health);
  const trainingOff = health.data?.training_enabled === false;
  const maxEpochs = health.data?.max_train_epochs ?? 300; // small hosts cap the run length
  const epochs = epochsInput ?? String(Math.min(40, maxEpochs));
  const start = useAction(api.startTraining);
  const stop = useAction(api.stopTraining);

  const status = stream.status;
  const state: TrainingState = status?.state ?? "idle";
  const active = state === "running" || state === "stopping";
  const refetchSaved = saved.refetch;
  useEffect(() => {
    if (state === "completed") refetchSaved(); // pick up the newly saved run
  }, [state, refetchSaved]);

  const params = { epochs: Number(epochs), batch_size: Number(batchSize), learning_rate: Number(learningRate) };
  const paramError =
    !Number.isInteger(params.epochs) || params.epochs < 1 || params.epochs > maxEpochs ? `Epochs must be a whole number from 1 to ${maxEpochs}.`
    : !Number.isInteger(params.batch_size) || params.batch_size < 8 || params.batch_size > 512 ? "Batch size must be a whole number from 8 to 512."
    : !(params.learning_rate > 0 && params.learning_rate <= 0.1) ? "Learning rate must be above 0 and at most 0.1."
    : null;

  const liveHasData = stream.history.loss.length > 0;
  const showLive = active || liveHasData;
  const lastCompleted = saved.data?.last_completed ?? null;
  const history = showLive ? stream.history : lastCompleted?.history ?? null;

  // ETA from measured epoch durations. Shown only after two epochs, and it is an upper bound.
  const epochDurations = stream.log.filter((e) => e.type === "epoch_end" && typeof e.epoch_seconds === "number")
    .map((e) => e.epoch_seconds as number);
  const eta = state === "running" && status?.epochs && epochDurations.length >= 2
    ? (epochDurations.reduce((a, b) => a + b, 0) / epochDurations.length) * (status.epochs - stream.history.loss.length)
    : null;

  const last = (key: "loss" | "accuracy" | "val_loss" | "val_accuracy" | "learning_rate") =>
    history && history[key].length ? history[key][history[key].length - 1] : null;

  return (
    <>
      <PageHeader title="Training Monitor"
                  description="Train the CNN from scratch on the backend and watch real progress events arrive over a WebSocket."
                  actions={
                    <span className={cn("data inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
                                        stream.connection === "open" ? "border-success/40 text-success" : "border-warning/50 text-warning")}
                          role="status" aria-live="polite">
                      {stream.connection === "open" ? <Wifi className="size-3.5" aria-hidden="true" /> : <WifiOff className="size-3.5" aria-hidden="true" />}
                      {stream.connection === "open" ? "Live stream connected" : stream.connection === "connecting" ? "Connecting to stream" : "Stream disconnected"}
                    </span>
                  } />

      {stream.connection === "closed" && (
        <ErrorState className="mb-6" title="The live stream is disconnected"
                    message="The page is retrying automatically. Charts show the last data received. Is the backend running?"
                    onRetry={stream.reconnect} />
      )}

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <div className="space-y-6">
          <Panel title="Run control">
            <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
              {[["tr-epochs", "Maximum epochs", epochs, setEpochs, `1 to ${maxEpochs}; early stopping may end sooner`],
                ["tr-batch", "Batch size", batchSize, setBatchSize, "8 to 512"],
                ["tr-lr", "Learning rate", learningRate, setLearningRate, "Adam, halved when validation loss stalls"]].map(([id, label, value, set, hint]) => (
                <div key={id as string}>
                  <label htmlFor={id as string} className="mb-1 block text-xs text-muted-foreground">{label as string}</label>
                  <Input id={id as string} inputMode="decimal" value={value as string} disabled={active}
                         aria-describedby={`${id}-hint`} onChange={(e) => (set as (v: string) => void)(e.target.value)} />
                  <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{hint as string}</p>
                </div>
              ))}
              {trainingOff && <p className="text-xs text-warning">Training is disabled on this deployment. The saved run below is real; retrain locally.</p>}
              {paramError && <p role="alert" className="text-xs text-destructive">{paramError}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {/* A finished run replaces the live model, so starting one takes a deliberate press-and-hold. */}
                <HoldButton variant="primary" disabled={trainingOff || active || !!paramError || start.loading || stream.connection !== "open"}
                            onHoldComplete={() => void start.run(params).then((r) => { if (r) stream.reconnect(); })}>
                  {active ? "Training in progress" : "Hold to start training"}
                </HoldButton>
                <Button type="button" variant="destructive" disabled={state !== "running" || stop.loading} onClick={() => void stop.run()}>
                  <Square aria-hidden="true" /> {state === "stopping" ? "Stopping" : "Stop safely"}
                </Button>
              </div>
            </form>
            {start.error && <ErrorState className="mt-3" title="Could not start training" message={start.error.message} />}
            {stop.error && <ErrorState className="mt-3" title="Could not stop training" message={stop.error.message} />}
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Only one run at a time. Start is disabled while a run is active.</li>
              <li>A completed run replaces the model that serves predictions, even a short one.</li>
              <li>A stopped run ends after the current batch and leaves the saved model untouched.</li>
              <li>Training uses the training split only. The test split is scored once, at the end.</li>
            </ul>
          </Panel>

          <Panel title="Event log" description="Newest first. Batch events are summarized in the progress bars.">
            {stream.log.length === 0 ? <EmptyState title="No events yet" message="Events appear here when a run starts." />
              : (
                <ol className="max-h-80 space-y-1.5 overflow-y-auto pr-1 text-xs" aria-label="Training events" tabIndex={0}>
                  {[...stream.log].reverse().map((e, i) => (
                    <li key={`${e.timestamp}-${e.type}-${i}`} className={cn("rounded border-l-2 pl-2",
                        e.type === "error" ? "border-destructive text-destructive" : e.type === "checkpoint_saved" ? "border-success" : "border-border")}>
                      <span className="data text-muted-foreground">{e.timestamp ? new Date(e.timestamp).toLocaleTimeString("en-GB") : ""}</span>{" "}
                      {describe(e)}
                    </li>
                  ))}
                </ol>
              )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Status"
                 actions={<span className={cn("data rounded-full border px-2.5 py-0.5 text-xs uppercase", STATE_STYLE[state])}>{state}</span>}>
            {!status ? <LoadingState label="Waiting for the training stream" rows={2} />
              : state === "idle" ? (
                <p className="text-sm text-muted-foreground">
                  No run has been started since the backend came up.
                  {lastCompleted ? " The charts below show the last completed run that was saved to disk." : ""}
                </p>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm" role="status" aria-live="polite">{status.error ? `Error: ${status.error}` : status.message}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProgressBar label="Epoch" value={stream.history.loss.length} max={status.epochs ?? 0}
                                 text={`${status.epoch ?? 0} of ${status.epochs ?? "?"}`} />
                    <ProgressBar label="Batch in this epoch" value={active ? stream.batch?.batch ?? 0 : 0} max={stream.batch?.steps ?? status.steps_per_epoch ?? 0}
                                 text={active && stream.batch ? `${stream.batch.batch} of ${stream.batch.steps} · loss ${fmt(stream.batch.loss, 4)}` : "not running"} />
                  </div>
                  <KeyValue columns={3} items={[
                    ["Run id", status.run_id ?? "n/a"],
                    ["Started", fmtDate(status.started_at)],
                    ["Finished", status.finished_at ? fmtDate(status.finished_at) : "running"],
                    ["Estimated time left", eta !== null ? `at most ${fmtDuration(eta)}` : active ? "not reliable yet" : "n/a"],
                    ["Training signals", status.dataset ? status.dataset.n_train.toLocaleString() : "n/a"],
                    ["Validation signals", status.dataset ? status.dataset.n_val.toLocaleString() : "n/a"],
                  ]} />
                  {eta !== null && <p className="text-xs text-muted-foreground">The estimate assumes every remaining epoch runs. Early stopping usually ends the run sooner.</p>}
                </div>
              )}
          </Panel>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Train loss" value={fmt(last("loss"), 4)} />
            <Stat label="Validation loss" value={fmt(last("val_loss"), 4)} tone="primary" />
            <Stat label="Train accuracy" value={fmtPct(last("accuracy"))} />
            <Stat label="Validation accuracy" value={fmtPct(last("val_accuracy"))} tone="primary" />
            <Stat label="Learning rate" value={last("learning_rate")?.toExponential(1) ?? "n/a"} />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {showLive ? `Values from the latest epoch of ${active ? "the run in progress" : "the most recent run in this session"}.`
              : lastCompleted ? `Values from the final epoch of the last completed run (${fmtDate(lastCompleted.trained_at)}).`
              : "No training history exists yet."}
          </p>

          {saved.error && !showLive && <ErrorState title="Saved training history is unavailable" message={saved.error.message} onRetry={saved.refetch} />}
          {!history || history.loss.length === 0 ? (
            active ? <Panel><LoadingState label="Waiting for the first epoch to finish" rows={3} /></Panel>
              : !saved.error && (saved.loading ? <Panel><LoadingState rows={3} /></Panel>
              : <EmptyState title="No training history yet" message="Start a run to see live loss, accuracy and learning-rate charts."
                            action={<Button variant="outline" size="sm" onClick={saved.refetch}><RefreshCw aria-hidden="true" /> Check again</Button>} />)
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Loss" description={showLive ? "Live: one point per finished epoch" : "Last completed run"}>
                <LossChart history={history} bestEpoch={showLive ? null : lastCompleted?.best_epoch} />
              </Panel>
              <Panel title="Accuracy" description="Training and validation">
                <AccuracyChart history={history} bestEpoch={showLive ? null : lastCompleted?.best_epoch} />
              </Panel>
              <Panel title="Validation detail" description="Validation loss decides the checkpoint and early stopping">
                <KeyValue columns={1} items={[
                  ["Epochs finished", String(history.loss.length)],
                  ["Lowest validation loss", fmt(Math.min(...history.val_loss), 4)],
                  ["At epoch", String(history.val_loss.indexOf(Math.min(...history.val_loss)) + 1)],
                  ["Highest validation accuracy", fmtPct(Math.max(...history.val_accuracy))],
                  ["Final train minus validation accuracy", fmtPct((last("accuracy") ?? 0) - (last("val_accuracy") ?? 0))],
                ]} />
              </Panel>
              <Panel title="Learning-rate history" description="Log scale. Steps down when validation loss stops improving.">
                <LearningRateChart history={history} />
              </Panel>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
