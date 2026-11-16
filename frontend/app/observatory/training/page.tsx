import type { Metadata } from "next";

import { TrainingPage } from "@/components/pages/training";

export const metadata: Metadata = { title: "Training Monitor" };

export default function Page() {
  return <TrainingPage />;
}
