"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ActionSearchBar, { type CommandItem } from "@/components/kokonutui/action-search-bar";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { NAV_ITEMS } from "@/lib/nav";

const PAGES: CommandItem[] = NAV_ITEMS.map(({ href, label, description, icon: Icon }) => ({
  id: href, label, href, group: "Pages", keywords: [description], icon: <Icon className="size-4" aria-hidden="true" />,
}));

/** Cmd/Ctrl+K: jump to a page, or open a signal in the explorer by KOI name, Kepler name or KIC id. */
export function CommandPalette() {
  const router = useRouter();
  const [used, setUsed] = useState(false); // signals are fetched only once the palette is first opened
  // shortcut: the API returns at most 200 signals per page; search server-side if the hosted subset outgrows that.
  const samples = useApi(() => api.samples({ page_size: 200 }), [], used);
  const signals: CommandItem[] = (samples.data?.items ?? []).map((s) => ({
    id: s.id, label: s.kepler_name ? `${s.kepoi_name} · ${s.kepler_name}` : s.kepoi_name, group: "Signals",
    keywords: [String(s.kepid), s.koi_disposition],
    href: `/observatory/light-curves?id=${encodeURIComponent(s.id)}`,
  }));
  return (
    <ActionSearchBar items={[...PAGES, ...signals]} defaultRecent={[]} shortcut label="Search pages and signals"
                     placeholder="Search pages or signals" className="command-palette hidden max-w-xs md:block"
                     onOpenChange={(open) => { if (open) setUsed(true); }}
                     onSelect={(item) => { if (item.href) router.push(item.href); }} />
  );
}
