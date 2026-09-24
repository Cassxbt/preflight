import { sharedRedis } from "./store";

const WINDOW_SECONDS = 60;
const REDIS_TIMEOUT_MS = 500;

// Vercel sets x-real-ip itself; the fallback only matters behind other proxies.
function clientIp(request: Request): string {
  const raw = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
  return /^[0-9a-fA-F:.]{2,45}$/.test(raw) ? raw : "unknown";
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("rate limit store timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// A budget for paid upstream calls, not a safety check: without Redis, or if Redis is slow or failing, requests go through.
export async function rateLimited(request: Request, scope: string, perMinute: number): Promise<Response | null> {
  let count: number;
  try {
    const redis = sharedRedis();
    if (!redis) return null;
    const key = `preflight:rl:${scope}:${clientIp(request)}:${Math.floor(Date.now() / 1000 / WINDOW_SECONDS)}`;
    const [hits] = await within(redis.multi().incr(key).expire(key, WINDOW_SECONDS).exec(), REDIS_TIMEOUT_MS);
    count = Number(hits);
  } catch {
    return null;
  }
  if (!(count > perMinute)) return null;
  const retryAfter = WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % WINDOW_SECONDS);
  return Response.json(
    { ok: false, code: "RATE_LIMITED", error: `Too many requests from this address. Try again in ${retryAfter} seconds.` },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}
