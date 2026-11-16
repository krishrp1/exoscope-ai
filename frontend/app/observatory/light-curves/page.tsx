import type { Metadata } from "next";

import { SectionPending } from "@/components/common/phase-placeholder";

export const metadata: Metadata = { title: "Light Curve Explorer" };

export default function Page() {
  return <SectionPending title="Light Curve Explorer" description="Inspect Kepler photometry for any dataset signal." />;
}
