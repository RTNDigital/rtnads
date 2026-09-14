import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@rtnads/shared"],
  serverExternalPackages: [
    "google-ads-api",
    "google-ads-node",
    "google-gax",
    "node-cron",
  ],
};

export default nextConfig;
