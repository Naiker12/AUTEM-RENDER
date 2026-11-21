import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "@react-three/drei", "three"],
  },
};

export default nextConfig;
