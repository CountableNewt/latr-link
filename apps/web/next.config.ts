import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["latr-packages", "latr-web-client"],
  env: {
    NEXT_PUBLIC_APP_ENV:
      process.env.NEXT_PUBLIC_APP_ENV?.trim() || process.env.APP_ENV?.trim() ||
      (process.env.VERCEL_ENV === "production" ? "prod" :
        process.env.VERCEL_ENV === "preview" ? "dev" : ""),
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
