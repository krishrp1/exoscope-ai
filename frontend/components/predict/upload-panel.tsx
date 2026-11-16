"use client";

import { FileUp, Play, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { selectClass } from "@/components/common/sample-picker";
import { ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-api";
import { api, type UploadOptions } from "@/lib/api";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UploadInspection } from "@/types/api";

const MAX_MB = 10;
const ACCEPT = ".csv,.txt,.tsv,.dat";

function parseNumber(text: string): number | null | "invalid" {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : "invalid";
}

/** Input B: drag-and-drop a CSV, check it, map its columns, then classify it. */
export function UploadPanel({ onRun, running, modelReady }: {
  onRun: (file: File, options: UploadOptions) => void; running: boolean; modelReady: boolean;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<UploadInspection | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [timeColumn, setTimeColumn] = useState("");
  const [fluxColumn, setFluxColumn] = useState("");
  const [period, setPeriod] = useState("");
  const [t0, setT0] = useState("");
  const [duration, setDuration] = useState("");
  const inspect = useAction(api.inspectUpload);

  const reset = () => {
    setFile(null);
    setInspection(null);
    setLocalError(null);
    inspect.clearError();
    if (inputRef.current) inputRef.current.value = "";
  };

  const accept = async (f: File | undefined) => {
    if (!f) return;
    reset();
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPT.split(",").includes(ext)) {
      setLocalError(`"${f.name}" is not a supported file type. Use ${ACCEPT.replaceAll(",", ", ")}.`);
      return;
    }
    if (f.size === 0) {
      setLocalError("The file is empty.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setLocalError(`The file is ${(f.size / 1e6).toFixed(1)} MB. The limit is ${MAX_MB} MB.`);
      return;
    }
    setFile(f);
    const result = await inspect.run(f);
    if (result) {
      setInspection(result);
      setTimeColumn(result.suggested_mapping.time ?? "");
      setFluxColumn(result.suggested_mapping.flux ?? "");
    }
  };

  const numbers = { period: parseNumber(period), t0: parseNumber(t0), duration: parseNumber(duration) };
  const given = [numbers.period, numbers.t0, numbers.duration].filter((v) => v !== null).length;
  const invalidNumber = Object.values(numbers).includes("invalid")
    || (typeof numbers.period === "number" && numbers.period <= 0)
    || (typeof numbers.duration === "number" && numbers.duration <= 0);
  const partial = given > 0 && given < 3;
  const sameColumn = !!timeColumn && timeColumn === fluxColumn;
  const numeric = inspection?.columns.filter((c) => c.is_numeric) ?? [];
  const fluxInfo = inspection?.columns.find((c) => c.name === fluxColumn);
  const canRun = !!file && !!inspection && !!fluxColumn && !sameColumn && !invalidNumber && !partial && !running && modelReady;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void accept(e.dataTransfer.files[0]); }}
        className={cn("rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors",
                      dragging ? "border-primary bg-primary/10" : "border-border")}>
        <FileUp className="mx-auto size-7 text-primary" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium">Drag a light-curve CSV here</p>
        <p className="mt-1 text-xs text-muted-foreground">or</p>
        <label htmlFor={`${uid}-file`} className="sr-only">Choose a light-curve CSV file</label>
        <input ref={inputRef} id={`${uid}-file`} type="file" accept={ACCEPT} className="sr-only"
               onChange={(e) => void accept(e.target.files?.[0])} />
        <Button variant="outline" size="sm" className="mt-2" onClick={() => inputRef.current?.click()}>Choose a file</Button>
      </div>

      <details className="rounded-lg border border-border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">File format</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Text file with a header row; comma, tab or semicolon separated; up to {MAX_MB} MB and 500,000 rows.</li>
          <li>One numeric flux column (any unit). A time column in days is recommended.</li>
          <li>Without a time column, rows are assumed to be evenly spaced at Kepler&apos;s 29.4-minute cadence.</li>
          <li>Rows with a missing or non-numeric value are dropped and counted. Lines starting with # are ignored.</li>
          <li>At least 200 valid observations are needed. Give the period, mid-transit time and duration if you know them.</li>
        </ul>
        <pre className="data mt-2 overflow-x-auto rounded bg-background px-3 py-2 text-xs text-muted-foreground">time,flux{"\n"}131.5124,10432.1{"\n"}131.5328,10431.7</pre>
      </details>

      {localError && <ErrorState title="This file was not accepted" message={localError} />}
      {inspect.error && <ErrorState title="The backend rejected this file" message={inspect.error.message} />}
      {inspect.loading && <LoadingState label="Validating and parsing the file" rows={2} />}

      {file && inspection && (
        <div className="space-y-4 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-sm">
              <span className="data block truncate font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">{fmtInt(inspection.n_rows)} rows · {inspection.columns.length} columns · {(file.size / 1024).toFixed(0)} kB</span>
            </p>
            <Button variant="ghost" size="icon-sm" onClick={reset} aria-label="Remove file"><X aria-hidden="true" /></Button>
          </div>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Column mapping</legend>
            <div>
              <label htmlFor={`${uid}-time`} className="mb-1 block text-xs text-muted-foreground">Time column</label>
              <select id={`${uid}-time`} className={cn(selectClass, "w-full")} value={timeColumn} onChange={(e) => setTimeColumn(e.target.value)}>
                <option value="">None (assume even 29.4 min spacing)</option>
                {numeric.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-flux`} className="mb-1 block text-xs text-muted-foreground">Flux column (required)</label>
              <select id={`${uid}-flux`} className={cn(selectClass, "w-full")} value={fluxColumn} onChange={(e) => setFluxColumn(e.target.value)}
                      aria-invalid={!fluxColumn || sameColumn}>
                <option value="">Choose a column</option>
                {numeric.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </fieldset>
          {!inspection.has_header && <p className="text-xs text-warning">No header row was found, so the columns were numbered. Check the mapping.</p>}
          {numeric.length === 0 && <p role="alert" className="text-xs text-destructive">No numeric column was found in this file.</p>}
          {sameColumn && <p role="alert" className="text-xs text-destructive">Time and flux must be different columns.</p>}
          {fluxInfo && fluxInfo.n_missing > 0 && (
            <p className="text-xs text-warning">{fmtInt(fluxInfo.n_missing)} rows have a missing or non-numeric flux value. They will be dropped.</p>
          )}

          <div className="overflow-x-auto">
            <table className="data w-full text-xs">
              <caption className="mb-1 text-left text-xs text-muted-foreground">First rows of the file</caption>
              <thead>
                <tr>{inspection.columns.map((c) => (
                  <th key={c.name} scope="col" className={cn("border-b border-border px-2 py-1 text-left font-medium",
                                                           c.name === fluxColumn && "text-primary", c.name === timeColumn && "text-accent-violet")}>
                    {c.name}{c.name === fluxColumn ? " (flux)" : c.name === timeColumn ? " (time)" : ""}
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {inspection.preview.map((row, i) => (
                  <tr key={i}>{row.map((v, j) => <td key={j} className="border-b border-border/50 px-2 py-1 text-muted-foreground">{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Transit ephemeris (optional)</legend>
            {[["period", "Period (days)", period, setPeriod], ["t0", "Mid-transit time", t0, setT0],
              ["dur", "Duration (hours)", duration, setDuration]].map(([key, label, value, set]) => (
              <div key={key as string}>
                <label htmlFor={`${uid}-${key}`} className="mb-1 block text-xs text-muted-foreground">{label as string}</label>
                <Input id={`${uid}-${key}`} inputMode="decimal" value={value as string} placeholder="estimate"
                       onChange={(e) => (set as (v: string) => void)(e.target.value)} />
              </div>
            ))}
          </fieldset>
          {invalidNumber && <p role="alert" className="text-xs text-destructive">Period and duration must be positive numbers; mid-transit time must be a number.</p>}
          {partial && !invalidNumber && <p role="alert" className="text-xs text-destructive">Give all three values, or leave all three empty to have them estimated.</p>}
          {given === 0 && <p className="text-xs text-muted-foreground">Left empty: the period is estimated from the data with a Box Least Squares search. This is less reliable than a known ephemeris.</p>}

          <Button disabled={!canRun}
                  onClick={() => file && onRun(file, {
                    time_column: timeColumn || null, flux_column: fluxColumn,
                    period: typeof numbers.period === "number" ? numbers.period : null,
                    t0: typeof numbers.t0 === "number" ? numbers.t0 : null,
                    duration_hours: typeof numbers.duration === "number" ? numbers.duration : null,
                  })}>
            <Play aria-hidden="true" /> {running ? "Analyzing" : "Run classification"}
          </Button>
          {!modelReady && <p className="text-xs text-warning">No trained model is available yet.</p>}
        </div>
      )}
    </div>
  );
}
