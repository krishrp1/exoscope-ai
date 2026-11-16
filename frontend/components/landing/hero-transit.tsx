"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ProvenanceBadge } from "@/components/common/badges";

// Geometry of the illustration (SVG user units).
const W = 520;
const SCENE_H = 250;
const STAR = { x: W / 2, y: 120, r: 62 };
const ORBIT = { rx: 215, ry: 34 };
const PLANET_R = 9;
const GRAPH = { x: 34, y: 268, w: W - 68, h: 92 };
const PERIOD_MS = 9000;
const DEPTH = (PLANET_R / STAR.r) ** 2; // area ratio of the two discs

/** Planet centre for an orbital phase in [0, 1). Phase 0.5 is mid-transit (planet in front). */
function planetAt(phase: number) {
  const a = 2 * Math.PI * (phase - 0.25);
  return { x: STAR.x + ORBIT.rx * Math.cos(a), y: STAR.y + ORBIT.ry * Math.sin(a) + 4, inFront: Math.sin(a) > 0 };
}

/** Relative brightness: the star dims by the area the planet covers while it is in front. */
function brightness(phase: number) {
  const p = planetAt(phase);
  if (!p.inFront) return 1;
  const d = Math.hypot(p.x - STAR.x, p.y - STAR.y);
  const overlap = Math.min(1, Math.max(0, (STAR.r + PLANET_R - d) / (2 * PLANET_R)));
  return 1 - DEPTH * overlap;
}

const graphX = (phase: number) => GRAPH.x + phase * GRAPH.w;
const graphY = (flux: number) => GRAPH.y + 14 + ((1 - flux) / DEPTH) * (GRAPH.h - 34);

export function HeroTransit() {
  const [phase, setPhase] = useState(0.5);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // static frame at mid-transit
    let raf = 0;
    const tick = (now: number) => {
      if (start.current === null) start.current = now - 0.3 * PERIOD_MS;
      setPhase(((now - start.current) % PERIOD_MS) / PERIOD_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 400; i++) {
      const ph = i / 400;
      pts.push(`${i === 0 ? "M" : "L"}${graphX(ph).toFixed(1)},${graphY(brightness(ph)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, []);

  const planet = planetAt(phase);
  const flux = brightness(phase);
  const planetEl = (
    <circle cx={planet.x} cy={planet.y} r={PLANET_R} fill="#0b1020" stroke="#38bdf8" strokeWidth="1.2" />
  );

  return (
    <figure className="glass glow relative mx-auto w-full max-w-xl rounded-2xl p-3 sm:p-4">
      <svg viewBox={`0 0 ${W} 372`} role="img" className="h-auto w-full"
           aria-label="Illustration: a planet orbits a star. When it crosses in front, the brightness graph below dips.">
        <defs>
          <radialGradient id="star-core" cx="42%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#fff7d6" />
            <stop offset="55%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
          <radialGradient id="star-halo" cx="50%" cy="50%" r="50%">
            <stop offset="35%" stopColor="rgba(253,230,138,0.35)" />
            <stop offset="100%" stopColor="rgba(253,230,138,0)" />
          </radialGradient>
        </defs>

        <ellipse cx={STAR.x} cy={STAR.y + 4} rx={ORBIT.rx} ry={ORBIT.ry} fill="none"
                 stroke="rgba(148,163,184,0.28)" strokeDasharray="3 6" />
        {!planet.inFront && planetEl}
        <circle cx={STAR.x} cy={STAR.y} r={STAR.r * 1.9} fill="url(#star-halo)" opacity={0.55 + 0.45 * ((flux - (1 - DEPTH)) / DEPTH)} />
        <circle cx={STAR.x} cy={STAR.y} r={STAR.r} fill="url(#star-core)" />
        {planet.inFront && planetEl}

        <rect x={GRAPH.x} y={GRAPH.y} width={GRAPH.w} height={GRAPH.h} rx="8" fill="rgba(5,8,22,0.6)"
              stroke="rgba(148,163,184,0.18)" />
        <text x={GRAPH.x + 8} y={GRAPH.y + GRAPH.h - 6} fill="#94a3b8" fontSize="10" fontFamily="var(--font-geist-mono), monospace">
          relative brightness
        </text>
        <text x={GRAPH.x + GRAPH.w - 8} y={GRAPH.y + GRAPH.h - 6} fill="#94a3b8" fontSize="10" textAnchor="end"
              fontFamily="var(--font-geist-mono), monospace">
          time
        </text>
        <path d={curve} fill="none" stroke="rgba(56,189,248,0.35)" strokeWidth="1.5" />
        <line x1={graphX(phase)} x2={graphX(phase)} y1={GRAPH.y + 4} y2={GRAPH.y + GRAPH.h - 4}
              stroke="rgba(56,189,248,0.25)" />
        <circle cx={graphX(phase)} cy={graphY(flux)} r="4.5" fill="#38bdf8" />
        <circle cx={graphX(phase)} cy={graphY(flux)} r="9" fill="rgba(56,189,248,0.25)" />
        <text x={STAR.x} y={SCENE_H - 6} fill="#94a3b8" fontSize="10" textAnchor="middle"
              fontFamily="var(--font-geist-mono), monospace">
          {flux < 1 ? "transit: the planet blocks part of the star" : "out of transit"}
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <span>Illustration of the transit method. Not an observation; the dip is exaggerated.</span>
        <ProvenanceBadge kind="synthetic" />
      </figcaption>
    </figure>
  );
}
