"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { DispositionBadge, ProvenanceBadge, SplitBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { SamplePicker } from "@/components/common/sample-picker";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Segmented } from "@/components/common/toggle";
import { ViewsPlot } from "@/components/charts/views-plot";
import { PredictionResult } from "@/components/predict/prediction-result";
import { AnalysisStages } from "@/components/predict/stages";
import { UploadPanel } from "@/components/predict/upload-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAction, useApi } from "@/hooks/use-api";
import { api, type UploadOptions } from "@/lib/api";
import { CLASS_COLOR, fmt } from "@/lib/format";
import type { Prediction, Sample } from "@/types/api";

type Source = "sample" | "upload";

function SamplePreview({ sample }: { sample: Sample }) {
  const { data, error, loading, refetch } = useApi(() => api.sample(sample.id, { max_points: 1, include_views: true }), [sample.id]);
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0">
          <span className="data font-medium">{sample.kepoi_name}</span>
          <span className="ml-2 text-xs text-muted-foreground">{sample.kepler_name ?? `KIC ${sample.kepid}`}</span>
        </p>
        <span className="flex gap-2"><DispositionBadge value={sample.koi_disposition} /><SplitBadge value={sample.split} /></span>
      </div>
      <p className="data mt-1 text-xs text-muted-foreground">
        P = {fmt(sample.koi_period, 4)} d · duration {fmt(sample.koi_duration, 2)} h · catalog depth {fmt(sample.koi_depth, 0)} ppm
      </p>
      <div className="mt-2">
        {error ? <ErrorState message={error.message} onRetry={refetch} />
          : loading && !data ? <LoadingState label="Loading preview" rows={2} />
          : data?.views ? <ViewsPlot height={210} ariaLabel={`Preview of the folded views of ${sample.kepoi_name}`}
                                     series={[{ name: sample.kepoi_name, views: data.views, color: CLASS_COLOR[sample.koi_disposition] }]} />
          : <EmptyState title="No preview" message={data?.processing_error ?? undefined} />}
      </div>
    </div>
  );
}

export function DetectPage() {
  const params = useSearchParams();
  const initialId = params.get("id");
  const [source, setSource] = useState<Source>("sample");
  const [picked, setPicked] = useState<Sample | null>(null);
  const [result, setResult] = useState<Prediction | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const model = useApi(api.modelStatus);
  const predictSample = useAction(api.predictSample);
  const predictUpload = useAction(api.predictUpload);
  const running = predictSample.loading || predictUpload.loading;
  const error = source === "sample" ? predictSample.error : predictUpload.error;
  const modelReady = !!model.data?.trained;

  // Deep link: /observatory/detect?id=K00002.01 preselects that sample.
  const linked = useApi(() => api.sample(initialId as string, { max_points: 1, include_views: false }), [initialId], !!initialId);
  const sample = picked ?? linked.data?.sample ?? null;

  const finish = (r: Prediction | null) => {
    if (!r) return;
    setResult(r);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const runSample = async () => {
    if (!sample) return;
    setResult(null);
    finish(await predictSample.run(sample.id));
  };
  const runUpload = async (file: File, options: UploadOptions) => {
    setResult(null);
    finish(await predictUpload.run(file, options));
  };

  return (
    <>
      <PageHeader title="AI Detection Studio"
                  description="Classify a signal with the trained CNN: pick one from the dataset, or upload your own light curve."
                  actions={<Segmented label="Input source" value={source}
                                      onChange={(v) => { setSource(v); setResult(null); predictSample.clearError(); predictUpload.clearError(); }}
                                      options={[{ value: "sample", label: "A · Dataset sample" }, { value: "upload", label: "B · Upload CSV" }]} />} />

      {model.error && <ErrorState className="mb-5" title="Cannot reach the model" message={model.error.message} onRetry={model.refetch} />}
      {model.data && !model.data.trained && (
        <EmptyState className="mb-5" title="No trained model yet"
                    message="Classification needs a trained model. Start a run in the Training Monitor; nothing is predicted until it finishes."
                    action={<Link href="/observatory/training" className={buttonVariants()}>Open the Training Monitor</Link>} />
      )}

      <div className="grid gap-5 xl:grid-cols-[24rem_1fr]">
        {source === "sample" ? (
          <Panel title="A · Choose a dataset sample" actions={<ProvenanceBadge kind="mast" />}>
            <SamplePicker selectedIds={sample ? [sample.id] : []} onSelect={(s) => { setPicked(s); setResult(null); }} />
          </Panel>
        ) : (
          <Panel title="B · Upload a light curve" actions={<ProvenanceBadge kind="user" />}>
            <UploadPanel onRun={runUpload} running={running} modelReady={modelReady} />
          </Panel>
        )}

        <div className="min-w-0 space-y-5">
          {source === "sample" && (
            <Panel title="Selected signal">
              {sample ? (
                <>
                  <SamplePreview sample={sample} />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button onClick={runSample} disabled={running || !modelReady}>
                      <Play aria-hidden="true" /> {running ? "Analyzing" : "Run classification"}
                    </Button>
                    {sample.split === "train" && <p className="text-xs text-warning">This signal is in the training split; the model has seen it.</p>}
                    {!sample.is_labelled && <p className="text-xs text-muted-foreground">Unresolved candidate: there is no label to check the result against.</p>}
                  </div>
                </>
              ) : initialId && linked.loading ? <LoadingState label="Loading the linked signal" rows={2} />
                : initialId && linked.error ? <ErrorState message={linked.error.message} />
                : <EmptyState title="No signal selected" message="Pick a signal from the list. Test-split signals are the fairest check, because the model never saw them." />}
            </Panel>
          )}

          {(running || error) && (
            <Panel title="Analysis">
              {running && <AnalysisStages running processing={null} />}
              {error && <ErrorState title="The analysis failed" message={error.message}
                                    onRetry={source === "sample" && sample ? runSample : undefined} />}
            </Panel>
          )}

          <div ref={resultRef} className="scroll-mt-20" aria-live="polite">
            {result ? <PredictionResult result={result} />
              : !running && !error && source === "upload" && (
                <Panel title="Result"><EmptyState title="No result yet" message="Upload a file, check the column mapping, then run the classification." /></Panel>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
