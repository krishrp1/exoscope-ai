"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ClassBarSeries {
  key: string;
  label: string;
  color: string;
}

export const chartTooltip = {
  contentStyle: { background: "#111114", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#fafafa" },
  itemStyle: { color: "#fafafa" },
  cursor: { fill: "rgba(39,39,42,0.5)" },
};
export const axisTick = { fill: "#a1a1aa", fontSize: 11 };

/** Grouped bar chart of counts per class. `rows` come straight from the API. */
export function ClassBars({ rows, series, height = 240, ariaLabel }: {
  rows: Record<string, string | number>[]; series: ClassBarSeries[]; height?: number; ariaLabel: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: "rgba(148,163,184,0.3)" }} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip {...chartTooltip} formatter={(v) => Number(v).toLocaleString()} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={56} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
