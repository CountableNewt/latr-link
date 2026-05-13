"use client";

import { useMemo } from "react";
import type { OAuthSession } from "@atproto/oauth-client-browser";
import { LatrRepo } from "@/lib/latrRepo";
import { useAuth } from "@/hooks/useAuth";

export function useLatrRepo(): LatrRepo | null {
  const { session, getOAuthSession } = useAuth();
  const oauth = getOAuthSession();

  return useMemo(() => {
    if (!session || !oauth) return null;
    return new LatrRepo(oauth as OAuthSession, session.did);
  }, [session, oauth]);
}
