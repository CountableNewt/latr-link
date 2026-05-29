import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["latr-packages", "latr-web-client"],
  env: {
    NEXT_PUBLIC_APP_ENV:
      process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "",
    /** Inlined at build from Vercel/local env (not NEXT_PUBLIC_*); still ships in the client bundle. */
    LATR_GATEWAY_CLIENT_CREDENTIAL:
      process.env.LATR_GATEWAY_CLIENT_CREDENTIAL ?? "",
    LATR_GATEWAY_CLIENT_ID: process.env.LATR_GATEWAY_CLIENT_ID ?? "",
    LATR_GATEWAY_API_KEY: process.env.LATR_GATEWAY_API_KEY ?? "",
  },
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/client-metadata.json",
          destination: "/api/oauth/web-client-metadata",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/client-metadata.json",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
