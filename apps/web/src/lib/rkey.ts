import { AtUri } from "@atproto/syntax";

export function rkeyFromAtUri(uri: string): string {
  const at = new AtUri(uri);
  return at.rkey ?? "";
}
