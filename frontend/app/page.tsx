import { ArrowRight, BookOpen, Layers, Orbit, Radar, Satellite, Sparkles, Telescope } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/common/reveal";
import { HeroTransit } from "@/components/landing/hero-transit";
import { LiveDatasetFacts } from "@/components/landing/live-facts";
import { buttonVariants } from "@/components/ui/button";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

const LAYERS = [
  ["Input", "2 channels x 256 bins", "Global and local phase-folded views"],
  ["Conv1D 32, kernel 5", "BatchNorm, ReLU, MaxPool", "Finds short local shapes: ingress, egress"],
  ["Conv1D 64, kernel 5", "BatchNorm, ReLU, MaxPool", "Combines them into dip profiles"],
  ["Conv1D 128, kernel 3", "BatchNorm, ReLU", "Whole-signal patterns such as a secondary eclipse"],
  ["Global average pooling", "128 features", "Position-independent summary"],
  ["Dense 64, Dropout", "ReLU", "Decision features, regularized"],
  ["Softmax", "2 classes", "CONFIRMED vs FALSE POSITIVE score"],
];

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
      <Reveal>
        <p className="data text-xs tracking-[0.2em] text-primary uppercase">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Orbit; title: string; children: React.ReactNode }) {
  return (
    <div className="glass h-full rounded-xl p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-wide">
            <Telescope className="size-5 text-primary" aria-hidden="true" /> ExoScope AI
          </Link>
          <nav aria-label="Landing sections" className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <Link href="#transit" className="hover:text-foreground">Transit method</Link>
            <Link href="#cnn" className="hover:text-foreground">The model</Link>
            <Link href="#dataset" className="hover:text-foreground">Dataset</Link>
          </nav>
          <Link href="/observatory" className={buttonVariants({ size: "sm" })}>Open<span className="max-[380px]:sr-only">&nbsp;observatory</span></Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <section aria-labelledby="hero-title" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pt-14 pb-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <p className="data inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
              <Sparkles className="size-3.5" aria-hidden="true" /> Deep learning on real Kepler photometry
            </p>
            <h1 id="hero-title" className="text-glow mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Discover Worlds Beyond Our Stars.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              ExoScope AI is a 1D convolutional network that looks at the tiny dip a planet makes when it crosses its
              star, and scores whether a Kepler signal looks like a confirmed planet or a false positive.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/observatory" className={cn(buttonVariants({ size: "lg" }), "glow h-11 px-5 text-base")}>
                Enter the Observatory <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="#science" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 px-5 text-base")}>
                <BookOpen aria-hidden="true" /> Explore the Science
              </Link>
            </div>
            <p className="mt-6 max-w-xl text-xs leading-relaxed text-muted-foreground">
              A model score is not a discovery. Confirming a planet takes follow-up observation and vetting by astronomers.
            </p>
          </div>
          <HeroTransit />
        </section>

        <Section id="science" eyebrow="01 The search" title="The Search for Exoplanets">
          <div className="grid gap-4 md:grid-cols-3">
            <Reveal><Card icon={Telescope} title="Too faint to see directly">
              A planet is drowned out by its star. Almost every known exoplanet was found indirectly, from what it does to the star&apos;s light.
            </Card></Reveal>
            <Reveal delay={0.08}><Card icon={Satellite} title="Kepler stared at one patch of sky">
              For four years NASA&apos;s Kepler telescope measured the brightness of about 150,000 stars every 29.4 minutes, looking for repeating dips.
            </Card></Reveal>
            <Reveal delay={0.16}><Card icon={Radar} title="Most dips are not planets">
              Eclipsing binary stars, background stars and instrument artefacts all make dips. Telling them apart is the vetting problem this project models.
            </Card></Reveal>
          </div>
        </Section>

        <Section id="transit" eyebrow="02 The method" title="How Transit Detection Works">
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              ["Measure", "Record the star's brightness over time: a light curve."],
              ["Detrend", "Remove slow drifts from the star and the instrument, keeping short dips."],
              ["Fold", "Stack every orbit on top of each other using the signal's period."],
              ["Classify", "Judge the folded shape: U-shaped planet transit, or V-shaped eclipse with a secondary dip?"],
            ].map(([title, text], i) => (
              <Reveal key={title} delay={i * 0.07}>
                <li className="glass h-full rounded-xl p-5">
                  <span className="data text-xs text-primary">STEP {i + 1}</span>
                  <h3 className="mt-1.5 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </Section>

        <Section id="why" eyebrow="03 The approach" title="Why Deep Learning?">
          <div className="grid gap-4 md:grid-cols-2">
            <Reveal><Card icon={Layers} title="Shape, not hand-made rules">
              Classic vetting uses hand-written tests. A convolutional network learns the discriminating shapes from labelled examples: transit depth profile, ingress slope, secondary eclipses.
            </Card></Reveal>
            <Reveal delay={0.08}><Card icon={Orbit} title="Inspired by published work">
              The approach follows Shallue and Vanderburg (2018), who trained a neural network on Kepler signals. This project is an independent, much smaller re-implementation of the idea. It did not discover any planet.
            </Card></Reveal>
          </div>
        </Section>

        <Section id="cnn" eyebrow="04 The model" title="Inside the 1D CNN">
          <Reveal>
            <ol className="glass divide-y divide-border rounded-xl">
              {LAYERS.map(([name, detail, role], i) => (
                <li key={name} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[2.2rem_1.2fr_1fr_1.6fr] sm:items-center sm:gap-4">
                  <span className="data text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-medium">{name}</span>
                  <span className="data text-xs text-muted-foreground">{detail}</span>
                  <span className="text-sm text-muted-foreground">{role}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </Section>

        <Section id="dataset" eyebrow="05 The data" title="The Kepler Dataset">
          <div className="grid gap-8 lg:grid-cols-2">
            <Reveal>
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
            </Reveal>
            <Reveal delay={0.08}><LiveDatasetFacts /></Reveal>
          </div>
        </Section>

        <Section id="explore" eyebrow="06 The observatory" title="Explore the Observatory">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {NAV_ITEMS.map(({ href, label, description, icon: Icon }, i) => (
              <Reveal key={href} delay={(i % 4) * 0.05}>
                <li className="h-full">
                  <Link href={href} className="glass group flex h-full flex-col rounded-xl p-4 transition-colors hover:border-primary/50">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                    <span className="mt-3 font-medium">{label}</span>
                    <span className="mt-1 text-sm text-muted-foreground">{description}</span>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary opacity-80 group-hover:opacity-100">
                      Open <ArrowRight className="size-3" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              </Reveal>
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
