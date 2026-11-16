import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/common/states";
import { LightCurvesPage } from "@/components/pages/light-curves";

export const metadata: Metadata = { title: "Light Curve Explorer" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading explorer" rows={4} />}>
      <LightCurvesPage />
    </Suspense>
  );
}
