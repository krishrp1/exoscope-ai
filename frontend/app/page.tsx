import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Starfield } from "@/components/common/starfield";
import { CnnExplorer } from "@/components/landing/cnn-explorer";
import { HeroTransit } from "@/components/landing/hero-transit";
import { LiveDatasetFacts } from "@/components/landing/live-facts";
import { ModelFacts } from "@/components/landing/model-facts";
import { ObservatoryHero } from "@/components/landing/observatory-hero";
import { PipelineStages } from "@/components/landing/pipeline-stages";
import { RealLightCurve } from "@/components/landing/real-light-curve";
import { SignalComparison } from "@/components/landing/signal-comparison";
import { buttonVariants } from "@/components/ui/button";
import { NAV_ITEMS } from "@/lib/nav";

function Section({ id, eyebrow, title, intro, children }: {
  id: string; eyebrow: string; title: string; intro?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {intro && <div className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">{intro}</div>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <Starfield />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <header className="glass-bar sticky top-0 z-40">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="font-semibold tracking-[0.08em]">EXOSCOPE<span className="text-muted-foreground"> AI</span></Link>
          <nav aria-label="Landing sections" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="#science" className="hover:text-foreground">Planet or impostor</Link>
            <Link href="#transit" className="hover:text-foreground">Pipeline</Link>
            <Link href="#cnn" className="hover:text-foreground">The model</Link>
            <Link href="#dataset" className="hover:text-foreground">Dataset</Link>
          </nav>
          <Link href="/observatory" className={buttonVariants({ size: "sm" })}><span>Open<span className="max-[380px]:sr-only">&nbsp;observatory</span></span></Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <ObservatoryHero
          panels={
            <>
              <div className="glass rounded-2xl p-3">
                <p className="eyebrow px-1 pt-1">The transit method</p>
                <HeroTransit compact />
              </div>
              <RealLightCurve />
              <ModelFacts />
            </>
          }>
          <p className="eyebrow">Kepler transit observatory · 1D CNN</p>
          <h1 id="hero-title" className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Which Kepler dips are really planets?
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A small neural network reads the folded light curve of a Kepler signal and scores it as a confirmed planet
            or a false positive. On 626 signals from stars it never saw during training, it is right about 90% of the time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/observatory/detect" className={`${buttonVariants({ size: "lg" })} fx-glow fx-magnetic`}>
              Classify a signal <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="#science" className={buttonVariants({ size: "lg", variant: "outline" })}>
              How it works
            </Link>
          </div>
          <p className="mt-6 max-w-xl text-xs leading-relaxed text-muted-foreground">
            A model score is not a discovery. Confirming a planet takes follow-up observation and vetting by astronomers.
          </p>
        </ObservatoryHero>

        <Section id="science" eyebrow="01 · Planet or impostor" title="Most dips in a star's light are not planets"
          intro={<p>
            A planet is far too faint to see next to its star, so almost every known exoplanet was found indirectly. For
            four years NASA&apos;s Kepler telescope measured the brightness of about 150,000 stars every 29.4 minutes,
            looking for dips that repeat. Telling a planet from an impostor is the vetting problem this project models.
          </p>}>
          <SignalComparison />
        </Section>

        <Section id="transit" eyebrow="02 · Pipeline" title="From brightness measurements to a score"
          intro={<p>
            Rather than hand-written vetting tests, a convolutional network learns the discriminating shapes from labelled
            examples. The approach follows Shallue and Vanderburg (2018); this is an independent, much smaller
            re-implementation, and it has not discovered any planet.
          </p>}>
          <PipelineStages />
        </Section>

        <Section id="cnn" eyebrow="03 · The model" title="Inside the 1D CNN"
          intro={<p>Choose a block to see what it does, its output shape and how many parameters it learns.</p>}>
          <CnnExplorer />
        </Section>

        <Section id="dataset" eyebrow="04 · Data" title="The Kepler dataset">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              <p>
                The starting point is the Kaggle dataset <span className="data text-foreground">arashnic/exoplanets</span>:
                the Kepler Objects of Interest catalog. It lists each candidate signal with its period, timing and
                its disposition, but it contains no light curves.
              </p>
              <p>
                The brightness measurements themselves were fetched from NASA&apos;s MAST archive for a sample of the
                catalog&apos;s stars. Labels come from the catalog, unchanged. Unresolved candidates are never used
                for training or scoring the model.
              </p>
            </div>
            <LiveDatasetFacts />
          </div>
        </Section>

        <Section id="explore" eyebrow="05 · Instruments" title="Explore the observatory">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {NAV_ITEMS.map(({ href, label, description, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="glass group flex h-full flex-col gap-3 rounded-2xl p-4 hover:text-foreground">
                  <Icon className="size-5 text-muted-foreground transition-colors group-hover:text-star" aria-hidden="true" />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
                  </span>
                  <ArrowRight className="mt-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        ExoScope AI. Catalog: Kaggle arashnic/exoplanets (NASA Exoplanet Archive). Light curves: NASA Kepler mission via MAST.
        Not affiliated with NASA.
      </footer>
    </>
  );
}
