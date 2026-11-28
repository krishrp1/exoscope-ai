"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, Telescope } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { Starfield } from "@/components/common/starfield";
import { CommandPalette } from "@/components/shell/command-palette";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Telescope className="size-4.5" aria-hidden="true" />
      </span>
      {compact ? <span className="sr-only">ExoScope AI home</span> : (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-wide">ExoScope AI</span>
          <span className="block text-[11px] text-muted-foreground">Transit observatory</span>
        </span>
      )}
    </Link>
  );
}

function NavLinks({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Observatory sections" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item, i) => {
        const { href, label, icon: Icon, group } = item;
        const primary = "primary" in item;
        const active = href === "/observatory" ? pathname === href : pathname.startsWith(href);
        const newGroup = i === 0 || NAV_ITEMS[i - 1].group !== group;
        return (
          <div key={href}>
            {newGroup && (collapsed
              ? i > 0 && <hr className="my-2 border-border" />
              : <p className={cn("px-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase", i > 0 && "mt-4")}>{group}</p>)}
            <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "group flex min-h-10 items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active ? "bg-primary/12 text-primary shadow-[inset_2px_0_0_var(--primary)]"
                           : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}>
              <Icon className="size-4.5 shrink-0" aria-hidden="true" />
              <span className={cn("flex-1", collapsed && "sr-only")}>{label}</span>
              {primary && !collapsed && !active && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Try it</span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

function BackendStatus() {
  const { data, error, refetch } = useApi(api.health);
  useEffect(() => {
    const id = setInterval(refetch, 15000);
    return () => clearInterval(id);
  }, [refetch]);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (data || error) return;
    const id = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(id);
  }, [data, error]);
  const offline = !!error;
  const label = offline ? "Backend offline" : !data && slow ? "Waking server (up to 1 min)" : !data ? "Connecting" : data.model_loaded ? "Model online" : "Model not trained";
  const color = offline ? "bg-destructive" : !data ? "bg-muted-foreground" : data.model_loaded ? "bg-success" : "bg-warning";
  return (
    <div role="status" aria-live="polite"
         className="data flex items-center gap-2 rounded-full border border-border bg-background-secondary/70 px-3 py-1 text-xs text-muted-foreground"
         title={offline ? error?.message : data ? `API v${data.version}, ${data.n_samples.toLocaleString()} samples, training ${data.training_state}` : undefined}>
      <span className={cn("size-2 rounded-full", color)} aria-hidden="true" />
      {label}
    </div>
  );
}

// Sidebar state lives in localStorage so it survives reloads; a memory fallback covers blocked storage.
const SIDEBAR_KEY = "exoscope.sidebar";
const SIDEBAR_EVENT = "exoscope:sidebar";
let sidebarFallback = false;

function readSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return sidebarFallback;
  }
}

function writeSidebar(collapsed: boolean) {
  sidebarFallback = collapsed;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

function subscribeSidebar(onChange: () => void) {
  window.addEventListener(SIDEBAR_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebar, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const current = NAV_ITEMS.find((n) => (n.href === "/observatory" ? pathname === n.href : pathname.startsWith(n.href)));

  const toggle = () => writeSidebar(!collapsed);

  return (
    <div className="flex min-h-screen w-full">
      <Starfield />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>

      <aside className={cn("glass-bar sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-b-0 p-3 lg:flex",
                           collapsed ? "w-16" : "w-64")}>
        <Brand compact={collapsed} />
        <div className="mt-5 flex-1 overflow-y-auto">
          <NavLinks collapsed={collapsed} />
        </div>
        <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className={cn("mt-2 text-muted-foreground", collapsed ? "justify-center" : "justify-start")}>
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <><PanelLeftClose aria-hidden="true" /> Collapse</>}
        </Button>
      </aside>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 border-border bg-background-secondary p-3">
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Observatory sections</SheetDescription>
            <Brand />
          </SheetHeader>
          <div className="mt-4">
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-bar sticky top-0 z-30 flex h-14 items-center gap-3 px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="size-11 lg:hidden" onClick={() => setDrawerOpen(true)}
                  aria-label="Open navigation menu">
            <Menu aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{current?.label ?? "Observatory"}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{current?.description}</p>
          </div>
          <CommandPalette />
          <BackendStatus />
        </header>
        <main id="main" tabIndex={-1} className="relative z-10 mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
          Catalog: Kaggle arashnic/exoplanets. Light curves: NASA Kepler via MAST. Model scores are not confirmations.
        </footer>
      </div>
    </div>
  );
}
