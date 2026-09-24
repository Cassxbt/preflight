import { z } from "zod";
import { PRESTOCKS_CATALOG_URL } from "./constants";

const CatalogEntry = z.object({
  name: z.string(),
  symbol: z.string(),
  contract_address: z.string(),
  markPrice: z.number().positive(),
  tokenPrice: z.number().positive(),
  image: z.string().url().optional(),
  description: z.string().optional(),
  external_url: z.string().url().optional(),
  markValuation: z.number().optional(),
  impliedValuation: z.number().optional(),
});

export type CatalogEntry = z.infer<typeof CatalogEntry>;

export type Catalog = { entries: CatalogEntry[]; unreadableMints: string[]; retrievedAt: string };

async function fetchCatalogOnce(): Promise<Catalog> {
  const res = await fetch(PRESTOCKS_CATALOG_URL, {
    headers: { "user-agent": "preflight/0.1" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`PreStocks catalog HTTP ${res.status}`);
  return parseCatalog(await res.json());
}

// One malformed row must not take every token down with it; that row's own mint is reported instead.
export function parseCatalog(body: unknown): Catalog {
  const rows = z.array(z.unknown()).parse(body);
  const entries: CatalogEntry[] = [];
  const unreadableMints: string[] = [];
  for (const row of rows) {
    const parsed = CatalogEntry.safeParse(row);
    if (parsed.success) entries.push(parsed.data);
    else if (typeof (row as { contract_address?: unknown })?.contract_address === "string") unreadableMints.push((row as { contract_address: string }).contract_address);
  }
  if (entries.length === 0) throw new Error("PreStocks catalog has no readable entries");
  return { entries, unreadableMints, retrievedAt: new Date().toISOString() };
}

// Mark prices do not move meaningfully within this window, and the endpoint rate-limits bursts.
// Every verdict records retrievedAt, so a cached answer is never presented as fresher than it is.
const CACHE_MS = 30_000;
let cached: Catalog | null = null;

// One retry: the endpoint usually answers in ~0.5 s but has been seen to stall past the timeout.
export async function fetchCatalog(): Promise<Catalog> {
  if (cached && Date.now() - Date.parse(cached.retrievedAt) < CACHE_MS) return cached;
  try {
    cached = await fetchCatalogOnce();
  } catch {
    cached = await fetchCatalogOnce();
  }
  return cached;
}

export function findExact(catalog: Catalog, mint: string): CatalogEntry | undefined {
  return catalog.entries.find((e) => e.contract_address === mint);
}
