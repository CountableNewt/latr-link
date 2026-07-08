"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useLatrRepo } from "@/hooks/useLatrRepo";
import {
  resolveSubjectPreviewForRow,
} from "@/lib/resolveSubject";
import type { LatrRepo } from "@/lib/latrRepo";
import type { SavedItemState } from "@/lib/latrRecords";
import { rkeyFromAtUri } from "@/lib/rkey";
import { removeCachedSubjectPreview } from "@/lib/savedPreviewCache";
import {
  createDemoSavedRows,
  removeSavedRow,
  setSavedRowState,
} from "@/lib/demoLibrary";
import { isLatrDemoDataEnabled } from "@/lib/demoMode";
import type { SavedRow } from "@/lib/savedLibraryTypes";

export type { SavedRow } from "@/lib/savedLibraryTypes";

async function buildLibrary(
  repo: LatrRepo
): Promise<SavedRow[]> {
  const items = await repo.listSavedItems();
  const rows: SavedRow[] = await Promise.all(
    items.map(async (rec) => ({
      rec,
      preview: await resolveSubjectPreviewForRow(repo, rec),
    }))
  );
  rows.sort(
    (a, b) =>
      new Date(b.rec.value.savedAt).getTime() -
      new Date(a.rec.value.savedAt).getTime()
  );
  return rows;
}

export function useSavedLibrary() {
  const repo = useLatrRepo();
  const { session } = useAuth();
  const demoMode = isLatrDemoDataEnabled();

  return useQuery({
    queryKey: ["saved-library", session?.did],
    queryFn: () => (demoMode ? createDemoSavedRows() : buildLibrary(repo!)),
    enabled: !!session && (demoMode || !!repo),
    refetchOnWindowFocus: "always",
  });
}

export function useInvalidateSavedLibrary() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: ["saved-library", session?.did],
    });
  };
}

function savedLibraryQueryKey(did: string | undefined) {
  return ["saved-library", did] as const;
}

export function useSavedLibraryMutations() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const repo = useLatrRepo();
  const demoMode = isLatrDemoDataEnabled();
  const queryKey = savedLibraryQueryKey(session?.did);

  const patchRows = useCallback(
    (updater: (rows: SavedRow[]) => SavedRow[]) => {
      queryClient.setQueryData<SavedRow[]>(queryKey, (rows) => {
        if (!rows) return rows;
        return updater(rows);
      });
    },
    [queryClient, queryKey]
  );

  const setItemState = useCallback(
    async (itemRkey: string, state: SavedItemState) => {
      if (!repo && !demoMode) throw new Error("Sign In to Update Saved Items");

      const previous = queryClient.getQueryData<SavedRow[]>(queryKey);
      patchRows((rows) => setSavedRowState(rows, itemRkey, state));

      if (demoMode) return;
      if (!repo) throw new Error("Sign In to Update Saved Items");

      try {
        await repo.setItemState(itemRkey, state);
      } catch (error) {
        if (previous !== undefined) {
          queryClient.setQueryData(queryKey, previous);
        }
        throw error;
      }
    },
    [demoMode, patchRows, queryClient, queryKey, repo]
  );

  const unsave = useCallback(
    async (itemRkey: string) => {
      if (!repo && !demoMode) throw new Error("Sign In to Remove Saved Items");

      const previous = queryClient.getQueryData<SavedRow[]>(queryKey);
      patchRows((rows) => removeSavedRow(rows, itemRkey));

      if (demoMode) return;
      if (!repo) throw new Error("Sign In to Remove Saved Items");

      try {
        await repo.unsave(itemRkey);
        const removed = previous?.find((row) => rkeyFromAtUri(row.rec.uri) === itemRkey);
        if (removed) {
          removeCachedSubjectPreview(removed.rec.value.subjectUri);
        }
      } catch (error) {
        if (previous !== undefined) {
          queryClient.setQueryData(queryKey, previous);
        }
        throw error;
      }
    },
    [demoMode, patchRows, queryClient, queryKey, repo]
  );

  return {
    setItemState,
    unsave,
    canMutate: !!session && (demoMode || !!repo),
  };
}
