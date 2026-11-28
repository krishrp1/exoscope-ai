"use client";

import { useRef, type ReactNode } from "react";

import { ObservatoryScene } from "@/components/landing/observatory-scene";

/** The cinematic entrance: the WebGL observatory behind the hero copy, with the ferrofluid docked in its own slot. */
export function ObservatoryHero({ children, panels }: { children: ReactNode; panels: ReactNode }) {
  const fluid = useRef<HTMLDivElement>(null);
  return (
    <section aria-labelledby="hero-title" className="observatory-hero relative isolate overflow-hidden">
      <ObservatoryScene anchor={fluid} />
      <div className="observatory-veil" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-7xl gap-8 px-5 pt-16 pb-8 sm:px-8 lg:min-h-[78svh] lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-24">
        <div className="relative z-10">{children}</div>
        {/* the ferrofluid is drawn by the scene into this slot; it reacts to the cursor */}
        <div ref={fluid} className="observatory-fluid mx-auto aspect-square w-full max-w-[min(78vw,520px)]" aria-hidden="true" />
      </div>
      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-4 px-5 pb-16 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_0.8fr]">
        {panels}
      </div>
    </section>
  );
}
