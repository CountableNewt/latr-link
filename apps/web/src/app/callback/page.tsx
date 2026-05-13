"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { handleCallback } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";

export default function CallbackPage() {
  const router = useRouter();
  const { applyOAuthSession } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    handleCallback()
      .then((oauthSession) => {
        applyOAuthSession(oauthSession);
        router.replace("/library");
      })
      .catch((err) => {
        console.error("OAuth callback error:", err);
        router.replace("/login?error=callback_failed");
      });
  }, [router, applyOAuthSession]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        <p className="text-sm text-zinc-500">Completing sign-in…</p>
      </div>
    </div>
  );
}
