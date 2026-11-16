import type { Metadata } from "next";

import { SectionPending } from "@/components/common/phase-placeholder";

export const metadata: Metadata = { title: "Dataset Explorer" };

export default function Page() {
  return <SectionPending title="Dataset Explorer" description="Browse the KOI catalog." />;
}
