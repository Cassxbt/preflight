import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.prestocks.com", pathname: "/logos/**" },
      { protocol: "https", hostname: "prestocks.com", pathname: "/logos/**" },
    ],
  },
  // Every route that runs a check hashes the bundled issuer captures at request time.
  outputFileTracingIncludes: {
    "/": ["./src/data/captures/**/*"],
    "/api/check": ["./src/data/captures/**/*"],
    "/api/order": ["./src/data/captures/**/*"],
  },
};

export default nextConfig;
