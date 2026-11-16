import type { Metadata } from "next";

import { SectionPending } from "@/components/common/phase-placeholder";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <SectionPending title="Overview" description="Mission status at a glance." />;
}
