import { z } from "zod";
import { PRESTOCKS_CATALOG_URL } from "./constants";

const CatalogEntry = z.object({
  name: z.string(),
  symbol: z.string(),
  contract_address: z.string(),
  markPrice: z.number().positive(),
  tokenPrice: z.number().positive(),
});

export type CatalogEntry = z.infer<typeof CatalogEntry>;

export type Catalog = { entries: CatalogEntry[]; retrievedAt: string };

async function fetchCatalogOnce(): Promise<Catalog> {
  const res = await fetch(PRESTOCKS_CATALOG_URL, {
    headers: { "user-agent": "preflight/0.1" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`PreStocks catalog HTTP ${res.status}`);
  const entries = z.array(CatalogEntry).parse(await res.json());
  if (entries.length === 0) throw new Error("PreStocks catalog is empty");
  return { entries, retrievedAt: new Date().toISOString() };
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
