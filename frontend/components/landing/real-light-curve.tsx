"use client";

import { useMemo } from "react";

import { ProvenanceBadge } from "@/components/common/badges";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";

const W = 360;
const H = 150;
const PAD = { l: 10, r: 10, t: 12, b: 22 };

/**
 * A real Kepler transit: the processed local view (binned, phase-folded PDCSAP flux) of the confirmed
 * planet with the strongest signal in the held-out test split. Every point is a measurement from MAST.
 * Nothing is drawn when the backend is unreachable: no stand-in data.
 */
export function RealLightCurve() {
  const list = useApi(() => api.samples({ disposition: "CONFIRMED", split: "test", sort: "koi_model_snr", order: "desc", page_size: 1 }));
  const id = list.data?.items[0]?.id;
  const detail = useApi(() => api.sample(id!, { include_views: true, max_points: 50 }), [id], !!id);

  const geom = useMemo(() => {
    const v = detail.data?.views?.local_view;
    if (!v) return null;
    const pts = v.hours_from_mid_transit.map((x, i) => [x, v.flux[i]] as const).filter(([, y]) => Number.isFinite(y));
    if (pts.length < 5) return null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
    const sy = (y: number) => PAD.t + ((y1 - y) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
    return {
      line: pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" "),
      dots: pts.map(([x, y]) => [sx(x), sy(y)] as const),
      zero: sx(0),
      range: [x0, x1] as const,
    };
  }, [detail.data]);

  const s = detail.data?.sample;
  const failed = list.error || detail.error || (list.data && !id);

  return (
    <figure className="glass rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Real Kepler transit</p>
        {s && <p className="data text-xs text-muted-foreground">{s.kepoi_name}{s.kepler_name ? ` · ${s.kepler_name}` : ""}</p>}
      </div>
      {geom ? (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" className="real-lc mt-2 h-auto w-full"
             aria-label={`Measured brightness of ${s?.kepoi_name} around mid-transit, folded on its ${s?.koi_period.toFixed(2)}-day period. The dip is the planet crossing its star.`}>
          <line x1={geom.zero} x2={geom.zero} y1={PAD.t - 4} y2={H - PAD.b + 2} stroke="rgba(243,180,90,0.45)" strokeDasharray="2 4" />
          <path d={geom.line} fill="none" stroke="rgba(242,243,245,0.85)" strokeWidth="1.3" pathLength={1} className="real-lc__line" />
          {geom.dots.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.6" fill="#f2f3f5" className="real-lc__dot" style={{ animationDelay: `${(i / geom.dots.length) * 1.4}s` }} />
          ))}
          <text x={PAD.l} y={H - 6} fill="#a3a6ad" fontSize="10" fontFamily="var(--font-geist-mono), monospace">{geom.range[0].toFixed(1)} h</text>
          <text x={geom.zero} y={H - 6} fill="#f3b45a" fontSize="10" textAnchor="middle" fontFamily="var(--font-geist-mono), monospace">mid-transit</text>
          <text x={W - PAD.r} y={H - 6} fill="#a3a6ad" fontSize="10" textAnchor="end" fontFamily="var(--font-geist-mono), monospace">+{geom.range[1].toFixed(1)} h</text>
        </svg>
      ) : (
        <p className="mt-3 flex min-h-28 items-center text-sm text-muted-foreground" role="status">
          {failed ? "The measured light curve appears here when the ExoScope backend is reachable." : "Loading a measured Kepler light curve."}
        </p>
      )}
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {s ? <>Period <span className="data text-foreground">{s.koi_period.toFixed(3)} d</span>, test split, label {s.koi_disposition}</> : "Highest-SNR confirmed planet in the test split"}
        </span>
        <ProvenanceBadge kind="mast" />
      </figcaption>
    </figure>
  );
}
