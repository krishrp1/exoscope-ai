import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/common/states";
import { DetectPage } from "@/components/pages/detect";

export const metadata: Metadata = { title: "AI Detection Studio" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading studio" rows={4} />}>
      <DetectPage />
    </Suspense>
  );
}
