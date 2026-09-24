import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("store selection", () => {
  it("refuses local files on Vercel when Redis is not configured", async () => {
    for (const name of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) vi.stubEnv(name, "");
    vi.stubEnv("VERCEL", "1");
    const { get } = await import("./store");
    expect(() => get("orders", "abcdefgh")).toThrow(/Redis is not configured/);
  });
});
