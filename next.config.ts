import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.prestocks.com", pathname: "/logos/**" }],
  },
  outputFileTracingIncludes: {
    "/api/check": ["./src/data/captures/**/*"],
    "/api/order": ["./src/data/captures/**/*"],
  },
};

export default nextConfig;
