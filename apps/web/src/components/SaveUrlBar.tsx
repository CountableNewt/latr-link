"use client";

import { FormEvent, useState } from "react";

import { useLatrRepo } from "@/hooks/useLatrRepo";
import { useInvalidateSavedLibrary } from "@/hooks/useSavedLibrary";

export function SaveUrlBar() {
  const repo = useLatrRepo();
  const invalidate = useInvalidateSavedLibrary();
  const [url, setUrl] = useState("");
  const [atUri, setAtUri] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmitUrl(e: FormEvent) {
    e.preventDefault();
    if (!repo) return;
    setBusy(true);
    setStatus(null);
    try {
      await repo.saveExternalUrl(url.trim());
      setUrl("");
      setStatus("Saved URL.");
      invalidate();
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : "Could not save this URL."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitAtUri(e: FormEvent) {
    e.preventDefault();
    if (!repo || !atUri.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await repo.saveSubjectUri(atUri.trim());
      setAtUri("");
      setStatus("Saved AT URI.");
      invalidate();
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : "Could not save this AT URI."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <form
        onSubmit={(e) => void onSubmitUrl(e)}
        className="flex flex-wrap items-end gap-2 px-4 py-3"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="save-url" className="text-xs font-medium text-zinc-500">
            Save URL
          </label>
          <input
            id="save-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            disabled={busy || !repo}
            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !url.trim() || !repo}
          className="h-9 shrink-0 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Saving…" : "Save link"}
        </button>
      </form>
      <form
        onSubmit={(e) => void onSubmitAtUri(e)}
        className="flex flex-wrap items-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800/80"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="save-uri" className="text-xs font-medium text-zinc-500">
            Save AT URI (post or record)
          </label>
          <input
            id="save-uri"
            type="text"
            value={atUri}
            onChange={(e) => setAtUri(e.target.value)}
            placeholder="at://did:plc:…/app.bsky.feed.post/…"
            disabled={busy || !repo}
            spellCheck={false}
            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !atUri.trim() || !repo}
          className="h-9 shrink-0 rounded-md border border-zinc-300 px-4 text-sm font-medium disabled:opacity-50 dark:border-zinc-600"
        >
          Save URI
        </button>
      </form>
      {status && (
        <p className="px-4 pb-3 text-xs text-zinc-500 dark:text-zinc-400">
          {status}
        </p>
      )}
    </div>
  );
}
