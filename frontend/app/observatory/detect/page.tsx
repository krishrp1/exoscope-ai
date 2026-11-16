import type { Metadata } from "next";

import { SectionPending } from "@/components/common/phase-placeholder";

export const metadata: Metadata = { title: "AI Detection Studio" };

export default function Page() {
  return <SectionPending title="AI Detection Studio" description="Classify a dataset signal or an uploaded light curve." />;
}
