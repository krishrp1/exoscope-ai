import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Starfield } from "@/components/common/starfield";
import { HeroTransit } from "@/components/landing/hero-transit";
import { LiveDatasetFacts } from "@/components/landing/live-facts";
import { buttonVariants } from "@/components/ui/button";
import { NAV_ITEMS } from "@/lib/nav";

const LAYERS = [
  ["Input", "2 channels x 256 bins", "Global and local phase-folded views"],
  ["Conv1D 32, kernel 5", "BatchNorm, ReLU, MaxPool", "Finds short local shapes: ingress, egress"],
  ["Conv1D 64, kernel 5", "BatchNorm, ReLU, MaxPool", "Combines them into dip profiles"],
  ["Conv1D 128, kernel 3", "BatchNorm, ReLU", "Whole-signal patterns such as a secondary eclipse"],
  ["Global average pooling", "128 features", "Position-independent summary"],
  ["Dense 64, Dropout", "ReLU", "Decision features, regularized"],
  ["Softmax", "2 classes", "CONFIRMED vs FALSE POSITIVE score"],
];

const STEPS = [
  ["Measure", "Record the star's brightness over time: a light curve."],
  ["Detrend", "Remove slow drifts from the star and the instrument, keeping short dips."],
  ["Fold", "Stack every orbit on top of each other using the signal's period."],
  ["Classify", "Judge the folded shape: a U-shaped planet transit, or a V-shaped eclipse with a secondary dip."],
];

const IMPOSTORS = [
  ["Eclipsing binaries", "Two stars orbit each other and dim one another. The dip is deeper and often V-shaped, with a second dip half an orbit later."],
  ["Background stars", "A faint binary behind the target blends its light into the target's measurements."],
  ["Instrument artefacts", "Pointing drift and detector effects repeat on the spacecraft's schedule, not the star's."],
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-14 sm:px-8 sm:py-16">
      <h2 id={`${id}-title`} className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-8">{children}</div>
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
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="font-semibold tracking-wide">ExoScope AI</Link>
          <nav aria-label="Landing sections" className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <Link href="#transit" className="hover:text-foreground">Transit method</Link>
            <Link href="#cnn" className="hover:text-foreground">The model</Link>
            <Link href="#dataset" className="hover:text-foreground">Dataset</Link>
          </nav>
          <Link href="/observatory" className={buttonVariants({ size: "sm" })}><span>Open<span className="max-[380px]:sr-only">&nbsp;observatory</span></span></Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <section aria-labelledby="hero-title" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pt-14 pb-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Which Kepler dips are really planets?
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              A small neural network reads the folded light curve of a Kepler signal and scores it as a confirmed planet
              or a false positive. On 626 signals from stars it never saw during training, it is right about 90% of the time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/observatory/detect" className={buttonVariants({ size: "lg" })}>
                Classify a signal <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="#science" className={buttonVariants({ size: "lg", variant: "outline" })}>
                How it works
              </Link>
            </div>
            <p className="mt-6 max-w-xl text-xs leading-relaxed text-muted-foreground">
              A model score is not a discovery. Confirming a planet takes follow-up observation and vetting by astronomers.
            </p>
          </div>
          <HeroTransit />
        </section>

        <Section id="science" title="Most dips in a star's light are not planets">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <p className="text-base leading-relaxed text-muted-foreground">
              A planet is far too faint to see next to its star, so almost every known exoplanet was found indirectly. For
              four years NASA&apos;s Kepler telescope measured the brightness of about 150,000 stars every 29.4 minutes,
              looking for dips that repeat. Telling a planet from an impostor is the vetting problem this project models.
            </p>
            <dl className="divide-y divide-border border-y border-border">
              {IMPOSTORS.map(([term, text]) => (
                <div key={term} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>

        <Section id="transit" title="From brightness measurements to a score">
          <ol className="grid gap-x-8 gap-y-6 border-l border-border pl-6 md:grid-cols-2 md:border-l-0 md:pl-0 lg:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="md:border-t md:border-border md:pt-4">
                <span className="data text-sm text-primary">{i + 1}</span>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Rather than hand-written vetting tests, a convolutional network learns the discriminating shapes from labelled
            examples. The approach follows Shallue and Vanderburg (2018); this is an independent, much smaller
            re-implementation, and it has not discovered any planet.
          </p>
        </Section>

        <Section id="cnn" title="Inside the 1D CNN">
          <ol className="surface divide-y divide-border rounded-xl">
            {LAYERS.map(([name, detail, role], i) => (
              <li key={name} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[2.2rem_1.2fr_1fr_1.6fr] sm:items-center sm:gap-4">
                <span className="data text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-medium">{name}</span>
                <span className="data text-xs text-muted-foreground">{detail}</span>
                <span className="text-sm text-muted-foreground">{role}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="dataset" title="The Kepler dataset">
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

        <Section id="explore" title="Explore the observatory">
          <ul className="grid gap-x-10 sm:grid-cols-2">
            {NAV_ITEMS.map(({ href, label, description }) => (
              <li key={href} className="border-t border-border">
                <Link href={href} className="group flex items-baseline justify-between gap-4 py-3.5 hover:text-primary">
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-sm text-muted-foreground">{description}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
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
