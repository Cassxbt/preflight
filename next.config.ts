import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The acknowledgement toggles must not be clickable through someone else's frame.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
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
