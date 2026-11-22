"use client";

import { Analytics, type BeforeSend } from "@vercel/analytics/next";

import { analyticsBeforeSend } from "@/lib/analyticsPrivacy";
import type { AppEnv } from "@/lib/environmentBanner";

const beforeSend: BeforeSend = (event) =>
  analyticsBeforeSend(event, typeof document === "undefined" ? "" : document.referrer);

export function WebAnalytics({ appEnv, deploymentEnv }: { appEnv: AppEnv; deploymentEnv?: string }) {
  return appEnv === "prod" && deploymentEnv === "production"
    ? <Analytics beforeSend={beforeSend} />
    : null;
}
