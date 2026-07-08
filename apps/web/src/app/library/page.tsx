"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SaveUrlBar } from "@/components/SaveUrlBar";
import {
  SavedRows,
  type SavedRowsSort,
} from "@/components/SavedRows";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import type { SavedRowsFilter } from "@/lib/savedRowContent";
import { cn } from "@/lib/utils";
import { LibraryRightRail } from "./LibraryRightRail";

const sortOptions: Array<{ value: SavedRowsSort; label: string }> = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title", label: "Title A-Z" },
];

export default function LibraryPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<SavedRowsFilter>("all");
  const [sort, setSort] = useState<SavedRowsSort>("newest");
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label;

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login");
    }
  }, [isLoading, session, router]);

  if (!session) {
    return null;
  }

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-[1180px] gap-6 overflow-hidden px-4 pb-6 pt-2 sm:px-6 lg:px-8">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col xl:max-w-[760px]">
        <header className="relative z-40 -mx-4 mb-5 flex shrink-0 flex-col gap-4 border-b border-border bg-background/95 px-4 pb-4 pt-1 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-8 lg:px-8">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold leading-tight text-foreground">
              Unread
            </h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "ml-auto h-7 cursor-pointer gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              )}
              aria-label={`Sort Queue: ${sortLabel}`}
              title={`Sort Queue: ${sortLabel}`}
            >
              {sortLabel}
              <ChevronDown className="size-3.5" aria-hidden strokeWidth={1.9} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuLabel>Sort Queue</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {sortOptions.map((option) => {
                const active = option.value === sort;
                return (
                  <DropdownMenuItem
                    key={option.value}
                    aria-pressed={active}
                    className="text-xs"
                    onClick={(event) => {
                      setSort(option.value);
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }}
                  >
                    <span className="min-w-0 flex-1">{option.label}</span>
                    {active ? (
                      <Check className="size-3.5 text-primary" aria-hidden />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="shrink-0 pb-5">
          <SaveUrlBar />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <SavedRows mode="unread" filter={filter} sort={sort} />
        </div>
      </section>
      <LibraryRightRail
        activeFilter={filter}
        className="self-start xl:mt-[4.75rem]"
        onFilterChange={setFilter}
      />
    </main>
  );
}
