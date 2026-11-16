"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, Telescope } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5" aria-label="ExoScope AI home">
      <span className="glow flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Telescope className="size-4.5" aria-hidden="true" />
      </span>
      {!compact && (
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
    <nav aria-label="Observatory sections" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/observatory" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  active ? "bg-primary/12 text-primary shadow-[inset_2px_0_0_var(--primary)]"
                         : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}>
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            <span className={cn(collapsed && "sr-only")}>{label}</span>
          </Link>
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
  const offline = !!error;
  const label = offline ? "Backend offline" : !data ? "Connecting" : data.model_loaded ? "Model online" : "Model not trained";
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

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const current = NAV_ITEMS.find((n) => (n.href === "/observatory" ? pathname === n.href : pathname.startsWith(n.href)));

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("exoscope.sidebar") === "collapsed");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("exoscope.sidebar", c ? "open" : "collapsed");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  };

  return (
    <div className="flex min-h-screen w-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>

      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-background-secondary/80 p-3 backdrop-blur transition-[width] duration-200 lg:flex",
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
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/75 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawerOpen(true)}
                  aria-label="Open navigation menu">
            <Menu aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{current?.label ?? "Observatory"}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{current?.description}</p>
          </div>
          <BackendStatus />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
          Catalog: Kaggle arashnic/exoplanets. Light curves: NASA Kepler via MAST. Model scores are not confirmations.
        </footer>
      </div>
    </div>
  );
}
