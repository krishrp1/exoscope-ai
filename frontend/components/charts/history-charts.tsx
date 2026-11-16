"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { axisTick, chartTooltip } from "@/components/charts/class-bars";
import type { TrainingHistory } from "@/types/api";

interface SeriesDef {
  key: keyof TrainingHistory;
  label: string;
  color: string;
}

function HistoryChart({ history, series, yLabel, ariaLabel, bestEpoch, log = false, height = 220, animate = false }: {
  history: TrainingHistory; series: SeriesDef[]; yLabel: string; ariaLabel: string; bestEpoch?: number | null;
  log?: boolean; height?: number; animate?: boolean;
}) {
  const rows = history.loss.map((_, i) => {
    const row: Record<string, number> = { epoch: i + 1 };
    for (const s of series) row[s.key] = history[s.key][i];
    return row;
  });
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 18, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="epoch" type="number" domain={[1, "dataMax"]} allowDecimals={false} tick={axisTick} tickLine={false}
                 axisLine={{ stroke: "rgba(148,163,184,0.3)" }} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} scale={log ? "log" : "auto"}
                 domain={log ? ["auto", "auto"] : ["auto", "auto"]}
                 tickFormatter={(v: number) => (log ? v.toExponential(0) : v.toFixed(2))}
                 label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11, dy: 30 }} />
          <Tooltip {...chartTooltip} labelFormatter={(e) => `epoch ${e}`}
                   formatter={(v) => (log ? Number(v).toExponential(2) : Number(v).toFixed(4))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {bestEpoch ? <ReferenceLine x={bestEpoch} stroke="rgba(74,222,128,0.6)" strokeDasharray="4 4"
                                      label={{ value: "best", fill: "#4ade80", fontSize: 10, position: "top" }} /> : null}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={1.8}
                  dot={rows.length < 25 ? { r: 2 } : false} isAnimationActive={animate} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LossChart(props: { history: TrainingHistory; bestEpoch?: number | null; animate?: boolean }) {
  return <HistoryChart {...props} yLabel="loss" ariaLabel={`Training and validation loss over ${props.history.loss.length} epochs`}
                       series={[{ key: "loss", label: "train loss", color: "#38bdf8" }, { key: "val_loss", label: "validation loss", color: "#a78bfa" }]} />;
}

export function AccuracyChart(props: { history: TrainingHistory; bestEpoch?: number | null; animate?: boolean }) {
  return <HistoryChart {...props} yLabel="accuracy" ariaLabel={`Training and validation accuracy over ${props.history.accuracy.length} epochs`}
                       series={[{ key: "accuracy", label: "train accuracy", color: "#38bdf8" }, { key: "val_accuracy", label: "validation accuracy", color: "#a78bfa" }]} />;
}

export function LearningRateChart(props: { history: TrainingHistory; animate?: boolean }) {
  return <HistoryChart {...props} log yLabel="learning rate" ariaLabel={`Learning rate over ${props.history.learning_rate.length} epochs`}
                       series={[{ key: "learning_rate", label: "learning rate", color: "#fbbf24" }]} />;
}
