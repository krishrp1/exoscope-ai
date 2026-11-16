import type { Metadata } from "next";

import { DatasetPage } from "@/components/pages/dataset";

export const metadata: Metadata = { title: "Dataset Explorer" };

export default function Page() {
  return <DatasetPage />;
}
