import type { RepoRecord } from "@/lib/latrRepo";
import type { ResolvedPreview } from "@/lib/resolveSubject";
import type { SavedItemRecord } from "@/lib/latrRecords";

export type SavedRow = {
  rec: RepoRecord<SavedItemRecord>;
  preview: ResolvedPreview;
};

