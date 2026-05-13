"use client";

import { useLatrRepo } from "@/hooks/useLatrRepo";
import {
  useInvalidateSavedLibrary,
  useSavedLibrary,
  type SavedRow,
} from "@/hooks/useSavedLibrary";
import { rkeyFromAtUri } from "@/lib/rkey";

function filterRows(
  rows: SavedRow[] | undefined,
  mode: "unread" | "archive"
): SavedRow[] {
  if (!rows) return [];
  return rows.filter((row) => {
    const state = row.rec.value.state ?? "unread";
    if (mode === "unread") return state !== "archived";
    return state === "archived";
  });
}

export function SavedRows({ mode }: { mode: "unread" | "archive" }) {
  const { data, isLoading, error } = useSavedLibrary();
  const repo = useLatrRepo();
  const invalidate = useInvalidateSavedLibrary();

  const rows = filterRows(data, mode);

  if (isLoading) {
    return (
      <p className="p-4 text-sm text-zinc-500">Loading saved items…</p>
    );
  }

  if (error) {
    return (
      <p className="p-4 text-sm text-red-600">
        {error instanceof Error ? error.message : "Failed to load"}
      </p>
    );
  }

  if (!rows.length) {
    return (
      <p className="p-6 text-sm text-zinc-500">
        {mode === "unread"
          ? "Nothing in your queue yet. Paste a URL above to save it."
          : "Archive is empty."}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {rows.map((row) => (
        <SavedRowItem
          key={row.rec.uri}
          row={row}
          repo={repo}
          onChanged={() => invalidate()}
        />
      ))}
    </ul>
  );
}

function SavedRowItem({
  row,
  repo,
  onChanged,
}: {
  row: SavedRow;
  repo: ReturnType<typeof useLatrRepo>;
  onChanged: () => void;
}) {
  const itemRkey = rkeyFromAtUri(row.rec.uri);
  const href = row.preview.href ?? row.rec.value.subjectUri;

  return (
    <li className="flex flex-col gap-2 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug text-zinc-900 dark:text-zinc-100">
          {row.preview.title}
        </p>
        {row.preview.subtitle && (
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            {row.preview.subtitle}
          </p>
        )}
        <p className="mt-1 truncate text-xs text-zinc-400">
          {row.preview.kind} · {row.rec.value.savedAt}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Open
        </a>
        {repo && (
          <>
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              onClick={async () => {
                const next =
                  row.rec.value.state === "archived" ? "unread" : "archived";
                await repo.setItemState(itemRkey, next);
                onChanged();
              }}
            >
              {row.rec.value.state === "archived" ? "Unarchive" : "Archive"}
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={async () => {
                await repo.unsave(itemRkey);
                onChanged();
              }}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}
