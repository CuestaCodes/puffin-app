import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Tauri desktop build
  // Note: API routes won't work in static mode - they're replaced by Tauri commands
  output: process.env.TAURI_ENV ? "export" : undefined,

  // Disable image optimization for static export (no server)
  images: {
    unoptimized: true,
  },

  // Ensure trailing slashes for static file serving
  trailingSlash: true,
};

export default nextConfig;
