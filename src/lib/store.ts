import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";

export type Bucket = "orders" | "receipts" | "locks";

// Pending orders and locks only matter while a signature can still land; receipts are kept.
const TTL_SECONDS: Record<Bucket, number | null> = { orders: 24 * 60 * 60, locks: 7 * 24 * 60 * 60, receipts: null };

type Store = {
  put(bucket: Bucket, id: string, json: string): Promise<void>;
  // Atomic claim: succeeds for exactly one caller, even under parallel requests.
  create(bucket: Bucket, id: string, json: string): Promise<boolean>;
  get(bucket: Bucket, id: string): Promise<string | null>;
};

function checkId(id: string): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new Error("Invalid record id");
  return id;
}

function redisStore(redis: Redis): Store {
  const key = (bucket: Bucket, id: string) => `preflight:${bucket}:${checkId(id)}`;
  const ttl = (bucket: Bucket) => (TTL_SECONDS[bucket] ? { ex: TTL_SECONDS[bucket] } : {});
  return {
    async put(bucket, id, json) {
      await redis.set(key(bucket, id), json, ttl(bucket));
    },
    async create(bucket, id, json) {
      return (await redis.set(key(bucket, id), json, { nx: true, ...ttl(bucket) })) === "OK";
    },
    async get(bucket, id) {
      return redis.get<string>(key(bucket, id));
    },
  };
}

function fileStore(): Store {
  const root = () => process.env.PREFLIGHT_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
  const file = (bucket: Bucket, id: string) => path.join(root(), bucket, `${checkId(id)}.json`);
  return {
    async put(bucket, id, json) {
      await mkdir(path.join(root(), bucket), { recursive: true });
      await writeFile(file(bucket, id), json, { encoding: "utf8", mode: 0o600 });
    },
    async create(bucket, id, json) {
      await mkdir(path.join(root(), bucket), { recursive: true });
      try {
        await writeFile(file(bucket, id), json, { encoding: "utf8", mode: 0o600, flag: "wx" });
        return true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw e;
      }
    },
    async get(bucket, id) {
      try {
        return await readFile(file(bucket, id), "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
  };
}

// Upstash when the deployment provides it (Vercel Marketplace injects either variable pair); local files otherwise.
function selectStore(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? redisStore(new Redis({ url, token, automaticDeserialization: false })) : fileStore();
}

let store: Store | undefined;
const active = () => (store ??= selectStore());

export const put = (bucket: Bucket, id: string, json: string) => active().put(bucket, id, json);
export const create = (bucket: Bucket, id: string, json: string) => active().create(bucket, id, json);
export const get = (bucket: Bucket, id: string) => active().get(bucket, id);
