export type AppEnv = "local" | "dev" | "prod" | "test";

export function getAppEnv(): AppEnv {
  const raw =
    process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() ??
    process.env.APP_ENV?.trim().toLowerCase() ??
    "local";
  if (raw === "prod" || raw === "dev" || raw === "test") return raw;
  return "local";
}

export function officialProvisionerDid(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_OFFICIAL_CLIENT_DID?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}
