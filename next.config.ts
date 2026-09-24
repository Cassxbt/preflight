import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/check": ["./src/data/captures/**/*"],
    "/api/order": ["./src/data/captures/**/*"],
  },
};

export default nextConfig;
