import type { Metadata } from "next";
import { Suspense } from "react";

import { LibraryChrome } from "./LibraryChrome";

export const metadata: Metadata = {
  title: {
    default: "Library",
    template: "%s · L@tr.link",
  },
};

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading library…</p>}>
      <LibraryChrome>{children}</LibraryChrome>
    </Suspense>
  );
}
