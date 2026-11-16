import type { Metadata } from "next";

import { SectionPending } from "@/components/common/phase-placeholder";

export const metadata: Metadata = { title: "Training Monitor" };

export default function Page() {
  return <SectionPending title="Training Monitor" description="Start a training run and watch it live." />;
}
