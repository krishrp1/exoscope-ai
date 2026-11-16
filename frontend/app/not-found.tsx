import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="data text-sm text-primary">404</p>
      <h1 className="mt-2 text-3xl font-semibold">No signal at these coordinates</h1>
      <p className="mt-2 max-w-md text-muted-foreground">The page you asked for does not exist.</p>
      <Link href="/observatory" className={buttonVariants({ className: "mt-6" })}>Go to the observatory</Link>
    </main>
  );
}
