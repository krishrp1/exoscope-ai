import type { Metadata } from "next";

import { SectionPending } from "@/components/common/phase-placeholder";

export const metadata: Metadata = { title: "Model Performance" };

export default function Page() {
  return <SectionPending title="Model Performance" description="Results on the held-out test set." />;
}
