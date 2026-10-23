import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  transpilePackages: ["three"],
};

export default nextConfig;
