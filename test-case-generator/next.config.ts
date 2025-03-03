import type { NextConfig } from "next";

const nextConfig = {
  serverExternalPackages: ['crawlee', 'playwright'],
  webpack: (config: any, { isServer }: any) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        async_hooks: false,
      };
    }
    return config;
  },
}

export default nextConfig;
