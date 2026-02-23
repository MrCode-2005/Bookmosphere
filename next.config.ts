import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  // Enable experimental features
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  // Turbopack config (Next.js 16 default)
  turbopack: {},

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "books.google.com",
      },
      {
        protocol: "https",
        hostname: "covers.openlibrary.org",
      },
    ],
  },

  // Webpack config for PDF.js worker (production builds)
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default nextConfig;

