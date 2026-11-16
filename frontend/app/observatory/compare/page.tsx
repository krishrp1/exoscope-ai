import type { Metadata } from "next";

import { SectionPending } from "@/components/common/phase-placeholder";

export const metadata: Metadata = { title: "Compare Signals" };

export default function Page() {
  return <SectionPending title="Compare Signals" description="Put several signals side by side." />;
}
