"use client";

import { cn } from "@/lib/utils";

/** A small segmented control. Renders radio semantics so it works with the keyboard and screen readers. */
export function Segmented<T extends string>({ label, value, options, onChange, className }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg border border-border bg-background-secondary p-0.5", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                              value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Check({ id, label, checked, onChange, disabled }: {
  id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className={cn("inline-flex items-center gap-2 text-sm", disabled && "opacity-50")}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
             className="size-4 rounded border-input accent-[var(--primary)]" />
      {label}
    </label>
  );
}
