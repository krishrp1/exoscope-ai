import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A glass card with an optional title row. The standard surface for every dashboard section. */
export function Panel({ title, description, actions, children, className, bodyClassName, as: Tag = "section" }: {
  title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
  bodyClassName?: string; as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("glass rounded-xl", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-wide">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </Tag>
  );
}

export function Stat({ label, value, hint, tone = "default" }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "primary" | "success" | "warning";
}) {
  const color = { default: "text-foreground", primary: "text-primary", success: "text-success", warning: "text-warning" }[tone];
  return (
    <div className="glass rounded-xl px-4 py-3.5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn("data mt-1.5 text-2xl font-semibold", color)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function KeyValue({ items, columns = 2 }: { items: [string, ReactNode][]; columns?: 1 | 2 | 3 }) {
  const grid = { 1: "grid-cols-1", 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-2 lg:grid-cols-3" }[columns];
  return (
    <dl className={cn("grid gap-x-6 gap-y-2.5 text-sm", grid)}>
      {items.map(([key, value]) => (
        <div key={key} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="data text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Disclaimer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="note" className={cn("rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  );
}
