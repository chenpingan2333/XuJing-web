import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker standalone 模式：仅打包生产必需文件，输出到 .next/standalone
  output: "standalone",
  reactStrictMode: false,
  assetPrefix: process.env.NODE_ENV === 'production' ? process.env.ASSET_PREFIX : undefined,

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Strip node: prefix from imports so webpack can resolve them
      const plugin = config.plugins.find(
        (p: { constructor: { name: string } }) => p.constructor.name === "NodeModuleReplacementPlugin" || false
      );
      if (!plugin) {
        // Add fallback: replace node: imports with bare module names
        const { NormalModuleReplacementPlugin } = require("webpack");
        config.plugins.push(
          new NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
            resource.request = resource.request.replace(/^node:/, "");
          })
        );
      }
    }
    return config;
  },

  serverExternalPackages: ["ioredis", "jose", "postgres"],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "43.138.193.173" },
      { protocol: "http", hostname: "43.138.193.173" },
      { protocol: "http", hostname: "127.0.0.1", port: "3003" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
