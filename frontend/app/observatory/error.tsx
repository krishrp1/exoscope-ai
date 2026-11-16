"use client";

import { ErrorState } from "@/components/common/states";

export default function ObservatoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="This page hit an unexpected error" message={error.message || "Unknown error"} onRetry={reset} />;
}
