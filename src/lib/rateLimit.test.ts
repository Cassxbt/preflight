import { beforeEach, describe, expect, it, vi } from "vitest";

const counts = new Map<string, number>();
let failing = false;
let hanging = false;
let configured = true;
let misconfigured = false;

const fakeRedis = {
  multi() {
    const keys: string[] = [];
    const p = {
      incr: (key: string) => (keys.push(key), p),
      expire: () => p,
      exec: async () => {
        if (hanging) return new Promise(() => {});
        if (failing) throw new Error("redis down");
        const n = (counts.get(keys[0]) ?? 0) + 1;
        counts.set(keys[0], n);
        return [n, 1];
      },
    };
    return p;
  },
};

vi.mock("./store", () => ({
  sharedRedis: () => {
    if (misconfigured) throw new Error("UrlError");
    return configured ? fakeRedis : null;
  },
}));

const { rateLimited } = await import("./rateLimit");
const from = (ip: string) => new Request("https://preflight.test/api/check", { headers: { "x-real-ip": ip } });

beforeEach(() => {
  counts.clear();
  failing = false;
  hanging = false;
  configured = true;
  misconfigured = false;
});

describe("rateLimited", () => {
  it("allows up to the limit per address, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < 3; i++) expect(await rateLimited(from("1.2.3.4"), "check", 3)).toBeNull();
    const res = await rateLimited(from("1.2.3.4"), "check", 3);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await res?.json()).code).toBe("RATE_LIMITED");
  });

  it("counts each address and each scope separately", async () => {
    for (let i = 0; i < 3; i++) await rateLimited(from("1.2.3.4"), "check", 3);
    expect(await rateLimited(from("5.6.7.8"), "check", 3)).toBeNull();
    expect(await rateLimited(from("1.2.3.4"), "order", 3)).toBeNull();
  });

  it("lets requests through when Redis fails or is not configured", async () => {
    failing = true;
    expect(await rateLimited(from("1.2.3.4"), "check", 0)).toBeNull();
    configured = false;
    expect(await rateLimited(from("1.2.3.4"), "check", 0)).toBeNull();
    misconfigured = true;
    expect(await rateLimited(from("1.2.3.4"), "check", 0)).toBeNull();
  });

  it("gives up on a hanging Redis within half a second", async () => {
    vi.useFakeTimers();
    hanging = true;
    const pending = rateLimited(from("1.2.3.4"), "check", 0);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });

  it("keys by the address and sends anything that is not one to a shared bucket", async () => {
    await rateLimited(from("2001:db8::1"), "check", 3);
    await rateLimited(from("1.2.3.4 *:{evil}"), "check", 3);
    expect([...counts.keys()].map((k) => k.split(":").slice(3, -1).join(":"))).toEqual(["2001:db8::1", "unknown"]);
  });
});
