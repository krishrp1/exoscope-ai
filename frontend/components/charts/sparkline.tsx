/** Tiny inline line chart for previews. Pure SVG, no interaction. */
import { PALETTE } from "@/lib/format";

export function Sparkline({ values, color = PALETTE.primary, height = 44, ariaLabel }: {
  values: number[]; color?: string; height?: number; ariaLabel: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 200;
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * w).toFixed(1)},${(4 + (1 - (v - min) / span) * (height - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}
         className="block w-full" style={{ height }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
