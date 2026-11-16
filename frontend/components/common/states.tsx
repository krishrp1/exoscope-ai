import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading", className, rows = 3 }: { label?: string; className?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span>{label}</span>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ title = "Could not load this data", message, onRetry, className }: {
  title?: string; message: string; onRetry?: () => void; className?: string;
}) {
  return (
    <div role="alert" className={cn("rounded-xl border border-destructive/40 bg-destructive/10 p-4", className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm break-words text-muted-foreground">{message}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action, className, icon }: {
  title: string; message?: string; action?: ReactNode; className?: string; icon?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center", className)}>
      <div className="text-muted-foreground" aria-hidden="true">{icon ?? <Inbox className="size-8" />}</div>
      <p className="mt-3 font-medium">{title}</p>
      {message && <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
