import type { Metadata } from "next";

import { ComparePage } from "@/components/pages/compare";

export const metadata: Metadata = { title: "Compare Signals" };

export default function Page() {
  return <ComparePage />;
}
