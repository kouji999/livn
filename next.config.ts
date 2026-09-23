import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // The showcase screenshots are captured at 2x and 3x device pixel ratios, so
    // their intrinsic width is large. Next optimizes them per breakpoint; this
    // only lists the widths worth generating.
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2048, 2880],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
