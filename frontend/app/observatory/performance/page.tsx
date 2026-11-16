import type { Metadata } from "next";

import { PerformancePage } from "@/components/pages/performance";

export const metadata: Metadata = { title: "Model Performance" };

export default function Page() {
  return <PerformancePage />;
}
