import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,

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

  serverExternalPackages: ["ioredis", "jose", "@neondatabase/serverless"],
};

export default nextConfig;
