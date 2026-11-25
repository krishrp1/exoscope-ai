"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, Loader2 } from "lucide-react";

import { fmt, STAGE_LABEL } from "@/lib/format";
import type { Processing } from "@/types/api";

const ORDER = ["loading", "validating", "normalizing", "extracting_features", "cnn_inference", "preparing_results"];

/**
 * The six analysis stages. While the request is in flight only a single "running" indicator is
 * shown, because the backend reports stage timings when it finishes, not while it runs.
 * Afterwards each stage shows the time the backend measured for it.
 */
export function AnalysisStages({ running, processing }: { running: boolean; processing: Processing | null }) {
  const reduce = useReducedMotion();
  const max = processing ? Math.max(...Object.values(processing.stages_ms), 0.001) : 1;
  return (
    <div>
      <ol className="space-y-1.5" aria-label="Analysis stages">
        {(processing?.stage_order ?? ORDER).map((stage, i) => {
          const ms = processing?.stages_ms[stage];
          const done = ms !== undefined;
          return (
            <motion.li key={stage} className="grid grid-cols-[1.25rem_minmax(0,10.5rem)_1fr_4.5rem] items-center gap-2 text-sm"
                       initial={done && !reduce ? { opacity: 0, x: -6 } : false} animate={{ opacity: 1, x: 0 }}
                       transition={{ delay: done ? i * 0.07 : 0, duration: 0.2 }}>
              <span aria-hidden="true">
                {done ? <Check className="size-4 text-success" />
                  : running ? <Loader2 className="size-4 animate-spin text-primary" />
                  : <span className="block size-2 translate-x-1 rounded-full bg-muted-foreground/40" />}
              </span>
              <span className={done ? "" : "text-muted-foreground"}>{STAGE_LABEL[stage] ?? stage}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {done && <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max((ms / max) * 100, 1.5)}%` }} />}
              </span>
              <span className="data text-right text-xs text-muted-foreground">{done ? `${fmt(ms, ms < 10 ? 2 : 1)} ms` : running ? "…" : ""}</span>
            </motion.li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
        {running ? "Running on the backend. Stage timings appear when it finishes."
          : processing ? `Timings measured by the backend for this request. Total ${fmt(processing.total_ms, 1)} ms.`
          : "Stage timings are measured by the backend for each request."}
      </p>
    </div>
  );
}
