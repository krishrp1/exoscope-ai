import type { Metadata } from "next";

import { SectionPending } from "@/components/common/phase-placeholder";

export const metadata: Metadata = { title: "About & Methodology" };

export default function Page() {
  return <SectionPending title="About & Methodology" description="How the system works, and its limits." />;
}
