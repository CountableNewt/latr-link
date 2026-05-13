import {
  COLLECTION_SAVED_EXTERNAL,
  type SavedExternalRecord,
} from "./types";

/** Build at:// URI for an external wrapper in the user's repo. */
export function atUriForExternal(did: string, externalRkey: string): string {
  return `at://${did}/${COLLECTION_SAVED_EXTERNAL}/${externalRkey}`;
}

export function isExternalCollection(collection: string): boolean {
  return collection === COLLECTION_SAVED_EXTERNAL;
}

export function previewTitleForExternal(
  rec: SavedExternalRecord
): string {
  return (
    rec.title?.trim() ||
    rec.site?.trim() ||
    rec.normalizedUrl ||
    rec.url ||
    "Saved link"
  );
}
