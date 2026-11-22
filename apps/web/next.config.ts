import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@react-three/drei",
      "three",
      "@base-ui/react",
    ],
  },
};

export default nextConfig;
