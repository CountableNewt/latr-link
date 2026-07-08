"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { SavedRows } from "@/components/SavedRows";
import { useAuth } from "@/hooks/useAuth";
import { LibraryRightRail } from "../LibraryRightRail";

export default function ArchivePage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login");
    }
  }, [isLoading, session, router]);

  if (!session) return null;

  return (
    <main className="mx-auto flex w-full max-w-[1180px] gap-6 px-4 pb-6 pt-2 sm:px-6 lg:px-8">
      <section className="min-w-0 flex-1 xl:max-w-[760px]">
        <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border bg-background/95 px-4 pb-5 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <h1 className="text-3xl font-semibold leading-tight text-foreground">
            Archive
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Finished reads and reference links stay here when they leave your active queue.
          </p>
        </header>
        <SavedRows mode="archive" />
      </section>
      <LibraryRightRail className="sticky top-6 self-start xl:mt-[7rem]" />
    </main>
  );
}
