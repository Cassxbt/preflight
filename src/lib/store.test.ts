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
    await expect(get("orders", "abcdefgh")).rejects.toThrow(/Redis is not configured/);
  });

  it("uses the first complete variable pair, so an empty one does not mask the other", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    const { sharedRedis } = await import("./store");
    expect(sharedRedis()).not.toBeNull();
  });
});
