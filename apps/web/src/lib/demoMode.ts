import {
  getAppEnv,
  normalizeAppEnv,
  type AppEnv,
} from "@/lib/environmentBanner";

export const DEMO_DID = "did:plc:latrlocaldemo";
export const DEMO_HANDLE = "reader.latr.local";

export function isLatrDemoDataEnabled(
  appEnv: AppEnv = getAppEnv(),
  requested: string | undefined = process.env.NEXT_PUBLIC_LATR_DEMO_DATA
): boolean {
  return normalizeAppEnv(appEnv) === "local" && requested?.trim() === "1";
}

