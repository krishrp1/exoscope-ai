import Link from "next/link";

import { EmptyState } from "@/components/common/states";
import { PageHeader } from "@/components/common/page-header";
import { buttonVariants } from "@/components/ui/button";

/** Temporary page body used while a section is being built. */
export function SectionPending({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState title="This section is being built"
                  message="The navigation and layout are in place. The live data view for this section arrives in the next build phase."
                  action={<Link href="/observatory" className={buttonVariants({ variant: "outline" })}>Back to overview</Link>} />
    </>
  );
}
