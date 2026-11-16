"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { DispositionBadge } from "@/components/common/badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Sample } from "@/types/api";

export const selectClass =
  "h-8 rounded-lg border border-input bg-background-secondary px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Search and filter dataset samples, then pick one. Used by the explorer, the studio and compare. */
export function SamplePicker({ selectedIds = [], onSelect, pageSize = 8, className }: {
  selectedIds?: string[]; onSelect: (sample: Sample) => void; pageSize?: number; className?: string;
}) {
  const uid = useId();
  const [search, setSearch] = useState("");
  const [disposition, setDisposition] = useState("");
  const [split, setSplit] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const { data, error, loading, refetch } = useApi(
    () => api.samples({ search: debounced, disposition, split, page, page_size: pageSize }),
    [debounced, disposition, split, page, pageSize],
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-40 flex-1">
          <label htmlFor={`${uid}-search`} className="sr-only">Search samples by KOI name, Kepler name or KIC id</label>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id={`${uid}-search`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                 placeholder="Search KOI, Kepler name, KIC" className="pl-8" />
        </div>
        <label htmlFor={`${uid}-disp`} className="sr-only">Filter by dataset label</label>
        <select id={`${uid}-disp`} value={disposition} onChange={(e) => { setDisposition(e.target.value); setPage(1); }} className={selectClass}>
          <option value="">All labels</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="FALSE POSITIVE">False positive</option>
          <option value="CANDIDATE">Candidate</option>
        </select>
        <label htmlFor={`${uid}-split`} className="sr-only">Filter by data split</label>
        <select id={`${uid}-split`} value={split} onChange={(e) => { setSplit(e.target.value); setPage(1); }} className={selectClass}>
          <option value="">All splits</option>
          <option value="test">Test</option>
          <option value="val">Validation</option>
          <option value="train">Training</option>
          <option value="unlabeled">Unlabeled</option>
        </select>
      </div>

      {error ? <ErrorState message={error.message} onRetry={refetch} />
        : !data && loading ? <LoadingState label="Loading samples" rows={4} />
        : data && data.items.length === 0 ? <EmptyState title="No samples match" message="Try a different search or clear the filters." />
        : data && (
          <>
            <ul className={cn("divide-y divide-border rounded-lg border border-border", loading && "opacity-60")} aria-busy={loading}>
              {data.items.map((s) => {
                const selected = selectedIds.includes(s.id);
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => onSelect(s)} aria-pressed={selected}
                            className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                                          selected && "bg-primary/10")}>
                      <span className="min-w-0">
                        <span className="data block font-medium">{s.kepoi_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.kepler_name ?? `KIC ${s.kepid}`} · P = {fmt(s.koi_period, 2)} d
                        </span>
                      </span>
                      <DispositionBadge value={s.koi_disposition} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="data">{data.total.toLocaleString()} samples · page {data.page} of {Math.max(data.pages, 1)}</span>
              <span className="flex gap-1">
                <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-accent disabled:opacity-40"
                        disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-accent disabled:opacity-40"
                        disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </span>
            </div>
          </>
        )}
    </div>
  );
}
