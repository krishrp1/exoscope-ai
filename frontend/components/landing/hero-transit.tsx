"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ProvenanceBadge } from "@/components/common/badges";

// Geometry of the illustration (SVG user units).
const W = 520;
const STAR = { x: W / 2, y: 118, r: 92 };
const PLANET_R = 11;
const PATH_Y = STAR.y + 8;                         // the planet crosses slightly below the star's centre
const X0 = STAR.x - STAR.r - 70;                   // start and end of the visible track
const X1 = STAR.x + STAR.r + 70;
const GRAPH = { x: 46, y: 244, w: W - 92, h: 104 };
const PERIOD_MS = 8000;
const DEPTH = (PLANET_R / STAR.r) ** 2;            // area ratio of the two discs
const LIMB = 0.6;                                  // linear limb darkening coefficient (Sun-like)
const GHOSTS = 5;

/** Planet x for a phase in [0, 1): it crosses the full track once per period. */
const planetX = (phase: number) => X0 + phase * (X1 - X0);

/**
 * Relative brightness while the planet covers part of the star. Linear limb darkening makes the dip
 * rounded at the bottom (a U), which is what real planetary transits look like.
 */
function brightness(phase: number) {
  const dx = planetX(phase) - STAR.x;
  const dy = PATH_Y - STAR.y;
  const d = Math.hypot(dx, dy);
  const overlap = Math.min(1, Math.max(0, (STAR.r + PLANET_R - d) / (2 * PLANET_R)));
  if (overlap === 0) return 1;
  const mu = Math.sqrt(Math.max(0, 1 - Math.min(1, d / STAR.r) ** 2));
  const local = (1 - LIMB * (1 - mu)) / (1 - LIMB / 3);  // surface brightness where the planet sits
  return 1 - DEPTH * overlap * local;
}

const graphX = (phase: number) => GRAPH.x + phase * GRAPH.w;
const graphY = (flux: number) => GRAPH.y + 16 + ((1 - flux) / (DEPTH * 1.25)) * (GRAPH.h - 40);

export function HeroTransit({ compact = false }: { compact?: boolean }) {
  const [phase, setPhase] = useState(0.5);
  const start = useRef<number | null>(null);
  const figure = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // static frame at mid-transit
    let raf = 0;
    let visible = true;
    const tick = (now: number) => {
      if (start.current === null) start.current = now - 0.3 * PERIOD_MS;
      setPhase(((now - start.current) % PERIOD_MS) / PERIOD_MS);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(tick);
    });
    if (figure.current) io.observe(figure.current);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 400; i++) {
      const ph = i / 400;
      pts.push(`${i === 0 ? "M" : "L"}${graphX(ph).toFixed(1)},${graphY(brightness(ph)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, []);

  // sampled exposures along the curve, drawn as crosses like individual measurements
  const samples = useMemo(() => Array.from({ length: 17 }, (_, i) => (i + 0.5) / 17), []);
  const flux = brightness(phase);
  const px = planetX(phase);
  const ghosts = Array.from({ length: GHOSTS }, (_, i) => phase - (i + 1) * 0.045).filter((p) => p > 0);

  return (
    <figure ref={figure} className={compact ? "w-full" : "glass relative mx-auto w-full max-w-xl rounded-2xl p-3 sm:p-4"}>
      <svg viewBox={`0 0 ${W} 362`} role="img" className="h-auto w-full"
           aria-label="Illustration: a planet crosses in front of its star. The brightness graph below dips while it does.">
        <defs>
          <radialGradient id="sun-limb" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb347" />
            <stop offset="62%" stopColor="#f2711c" />
            <stop offset="88%" stopColor="#c2410c" />
            <stop offset="100%" stopColor="#7c2d12" />
          </radialGradient>
          <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="rgba(249,115,22,0.35)" />
            <stop offset="100%" stopColor="rgba(249,115,22,0)" />
          </radialGradient>
          {/* convection granulation on the surface */}
          <filter id="sun-granules" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix"
                           values="0 0 0 0 1  0 0 0 0 0.85  0 0 0 0 0.55  0 0 0 1.6 -0.55" result="g" />
            <feComposite in="g" in2="SourceGraphic" operator="in" />
          </filter>
          <clipPath id="sun-disc"><circle cx={STAR.x} cy={STAR.y} r={STAR.r} /></clipPath>
        </defs>

        <circle cx={STAR.x} cy={STAR.y} r={STAR.r * 1.45} fill="url(#sun-glow)" opacity={0.5 + 0.5 * ((flux - (1 - DEPTH)) / DEPTH)} />
        <circle cx={STAR.x} cy={STAR.y} r={STAR.r} fill="url(#sun-limb)" />
        <g clipPath="url(#sun-disc)" opacity="0.55" style={{ mixBlendMode: "overlay" }}>
          <rect x={STAR.x - STAR.r} y={STAR.y - STAR.r} width={STAR.r * 2} height={STAR.r * 2} filter="url(#sun-granules)" fill="#fff" />
        </g>

        {/* where the planet has just been, then where it is */}
        {ghosts.map((g, i) => (
          <circle key={i} cx={planetX(g)} cy={PATH_Y} r={PLANET_R * 0.85} fill="#0a0a0a" opacity={0.42 - i * 0.07} />
        ))}
        <circle cx={px} cy={PATH_Y} r={PLANET_R} fill="#050505" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
        <line x1={px} x2={px} y1={PATH_Y + PLANET_R + 3} y2={graphY(flux)} stroke="rgba(255,255,255,0.45)" strokeDasharray="1.5 3.5" />

        {/* light curve */}
        <line x1={GRAPH.x} x2={GRAPH.x} y1={GRAPH.y} y2={GRAPH.y + GRAPH.h - 18} stroke="rgba(255,255,255,0.55)" />
        <line x1={GRAPH.x} x2={GRAPH.x + GRAPH.w} y1={GRAPH.y + GRAPH.h - 18} y2={GRAPH.y + GRAPH.h - 18} stroke="rgba(255,255,255,0.55)" />
        <path d={`M${GRAPH.x - 4},${GRAPH.y + 6} L${GRAPH.x},${GRAPH.y} L${GRAPH.x + 4},${GRAPH.y + 6}`} fill="none" stroke="rgba(255,255,255,0.55)" />
        <path d={curve} fill="none" stroke="rgba(242,243,245,0.85)" strokeWidth="1.4" />
        {samples.map((s) => {
          const x = graphX(s), y = graphY(brightness(s));
          return <path key={s} d={`M${x - 3},${y - 3} L${x + 3},${y + 3} M${x + 3},${y - 3} L${x - 3},${y + 3}`} stroke="rgba(242,243,245,0.6)" strokeWidth="1" />;
        })}
        <circle cx={graphX(phase)} cy={graphY(flux)} r="4.5" fill="#f3b45a" />
        <text x={GRAPH.x - 10} y={GRAPH.y + 50} fill="#a3a6ad" fontSize="11" textAnchor="middle"
              transform={`rotate(-90 ${GRAPH.x - 10} ${GRAPH.y + 50})`} fontFamily="var(--font-geist-sans), sans-serif">Brightness</text>
        <text x={GRAPH.x + GRAPH.w / 2} y={GRAPH.y + GRAPH.h} fill="#a3a6ad" fontSize="11" textAnchor="middle"
              fontFamily="var(--font-geist-sans), sans-serif">Time</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <span>Illustration of the transit method. Not an observation; the dip is exaggerated.</span>
        <ProvenanceBadge kind="synthetic" />
      </figcaption>
    </figure>
  );
}
