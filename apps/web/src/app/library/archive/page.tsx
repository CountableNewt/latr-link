"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { SavedRows } from "@/components/SavedRows";
import { useAuth } from "@/hooks/useAuth";

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
    <>
      <header className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">Archive</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Items marked archived.
        </p>
      </header>
      <SavedRows mode="archive" />
    </>
  );
}
