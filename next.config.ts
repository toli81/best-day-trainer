import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large video uploads (4GB max)
  experimental: {
    serverActions: {
      bodySizeLimit: "4gb",
    },
  },
  // Allow serving images from clips directory
  images: {
    remotePatterns: [],
  },
  // Increase API route body size
  serverExternalPackages: ["better-sqlite3", "fluent-ffmpeg", "ffmpeg-static"],
};

export default nextConfig;
