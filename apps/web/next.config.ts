import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["latr-kit"],
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
