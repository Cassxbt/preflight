import { z } from "zod";
import { fetchCatalog, findExact } from "./catalog";
import { lifecycleFor } from "./lifecycle";
import { readMintState, scheduledMultiplier, type MultiplierSchedule } from "./mintState";

const GECKO = "https://api.geckoterminal.com/api/v2/networks/solana";

// GeckoTerminal prices raw token units; a Token-2022 scaled-UI multiplier changes what one displayed token is.
const MULTIPLIER_CACHE_MS = 10 * 60_000;
const SNAPSHOT_CACHE_MS = 15_000;
// The free API allows about 30 calls a minute; a 7-day chart barely changes in 5 minutes.
const DETAIL_CACHE_MS = 5 * 60_000;

const schedules = new Map<string, { value: MultiplierSchedule; at: number }>();
let snapshot: { at: number; value: MarketSnapshot } | null = null;
let snapshotInFlight: Promise<MarketSnapshot> | null = null;
const inFlight = new Map<string, Promise<unknown>>();
const details = new Map<string, { at: number; value: TokenDetail }>();

async function gecko(path: string): Promise<unknown> {
  const send = () => fetch(`${GECKO}${path}`, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  let res = await send();
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await send();
  }
  if (!res.ok) throw new Error(`GeckoTerminal ${path.split("?")[0]} ${res.status}`);
  return res.json();
}

export const CHART_RANGES = {
  "1D": "minute?aggregate=15&limit=96",
  "1W": "hour?aggregate=4&limit=42",
  "1M": "day?aggregate=1&limit=30",
} as const;
export type ChartRange = keyof typeof CHART_RANGES;

const charts = new Map<string, { at: number; value: [number, number][] }>();

// Close price per displayed token, oldest first. Null when the source could not answer.
export async function tokenChart(mint: string, pool: string, range: ChartRange): Promise<[number, number][] | null> {
  const key = `${mint}:${range}`;
  const hit = charts.get(key);
  if (hit && Date.now() - hit.at < DETAIL_CACHE_MS) return hit.value;
  try {
    const [body, scale] = await Promise.all([
      shared(`ohlcv:${pool}:${range}`, () => gecko(`/pools/${pool}/ohlcv/${CHART_RANGES[range]}&currency=usd&token=${mint}`)),
      multiplier(mint),
    ]);
    const byTime = new Map<number, number>();
    for (const c of Ohlcv.parse(body).data.attributes.ohlcv_list) byTime.set(c[0], c[4] / scale);
    const value = [...byTime].sort((a, b) => a[0] - b[0]);
    if (value.length < 2) return hit?.value ?? null;
    charts.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? null;
  }
}

// The schedule is cached, never the resolved value, so a scheduled multiplier change applies the moment it takes effect.
async function multiplier(mint: string): Promise<number> {
  let hit = schedules.get(mint);
  if (!hit || Date.now() - hit.at >= MULTIPLIER_CACHE_MS) {
    hit = { value: (await readMintState(mint)).multiplierSchedule, at: Date.now() };
    schedules.set(mint, hit);
  }
  return scheduledMultiplier(hit.value, Math.floor(Date.now() / 1000));
}

// Concurrent requests for the same upstream resource share one fetch.
function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = load().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

const MultiToken = z.object({
  attributes: z.object({ address: z.string(), price_usd: z.string().nullable(), volume_usd: z.object({ h24: z.string().nullable() }).partial().nullable() }),
  relationships: z.object({ top_pools: z.object({ data: z.array(z.object({ id: z.string() })) }) }).partial().optional(),
});

export type MarketQuote = { mint: string; priceUsd: number | null; volume24hUsd: number | null; topPool: string | null };
export type MarketSnapshot = { at: string; source: "GeckoTerminal"; quotes: MarketQuote[] };

export async function marketSnapshot(): Promise<MarketSnapshot> {
  if (snapshot && Date.now() - snapshot.at < SNAPSHOT_CACHE_MS) return snapshot.value;
  snapshotInFlight ??= loadSnapshot().finally(() => {
    snapshotInFlight = null;
  });
  try {
    return await snapshotInFlight;
  } catch (e) {
    // A stale price with its timestamp beats no price while the source is rate-limiting.
    if (snapshot) return snapshot.value;
    throw e;
  }
}

async function loadSnapshot(): Promise<MarketSnapshot> {
  const catalog = await fetchCatalog();
  const mints = catalog.entries.map((e) => e.contract_address);
  const [body, scales] = await Promise.all([gecko(`/tokens/multi/${mints.join(",")}`), Promise.all(mints.map((m) => multiplier(m).catch(() => null)))]);
  const tokens = z.object({ data: z.array(MultiToken) }).parse(body).data;
  const quotes = mints.map((mint, i) => {
    const t = tokens.find((x) => x.attributes.address === mint);
    const raw = t?.attributes.price_usd ? Number(t.attributes.price_usd) : null;
    const scale = scales[i];
    return {
      mint,
      priceUsd: raw !== null && scale ? raw / scale : null,
      volume24hUsd: t?.attributes.volume_usd?.h24 ? Number(t.attributes.volume_usd.h24) : null,
      topPool: t?.relationships?.top_pools?.data[0]?.id.replace(/^solana_/, "") ?? null,
    };
  });
  const value: MarketSnapshot = { at: new Date().toISOString(), source: "GeckoTerminal", quotes };
  snapshot = { at: Date.now(), value };
  return value;
}

const Pool = z.object({
  data: z.object({
    attributes: z.object({
      name: z.string(),
      reserve_in_usd: z.string().nullable(),
      price_change_percentage: z.record(z.string(), z.string().nullable()),
      transactions: z.object({ h24: z.object({ buys: z.number(), sells: z.number(), buyers: z.number(), sellers: z.number() }) }),
    }),
  }),
});

const Ohlcv = z.object({ data: z.object({ attributes: z.object({ ohlcv_list: z.array(z.array(z.number())) }) }) });

export type TokenDetail = {
  mint: string;
  symbol: string;
  name: string;
  description: string | null;
  image: string | null;
  issuerUrl: string | null;
  markPrice: number;
  tokenPrice: number;
  markValuation: number | null;
  impliedValuation: number | null;
  multiplier: number;
  pool: { name: string; liquidityUsd: number | null; change24hPct: number | null; buys24h: number; sells24h: number; buyers24h: number; sellers24h: number } | null;
  poolId: string | null;
  // [unix seconds, close price per displayed token], oldest first; the 1W range
  candles: [number, number][];
  lifecycle: { state: string; deadline: string; statement: string; issuerUrl: string } | null;
  fetchedAt: string;
};

export async function tokenDetail(mint: string): Promise<TokenDetail | null> {
  const hit = details.get(mint);
  if (hit && Date.now() - hit.at < DETAIL_CACHE_MS) return hit.value;

  const catalog = await fetchCatalog();
  const entry = findExact(catalog, mint);
  if (!entry) return null;
  const [market, scale] = await Promise.all([marketSnapshot().catch(() => null), multiplier(mint)]);
  const poolId = market?.quotes.find((q) => q.mint === mint)?.topPool ?? null;

  const [pool, candles] = poolId
    ? await Promise.all([
        shared(`pool:${poolId}`, () => gecko(`/pools/${poolId}`))
          .then((b) => Pool.parse(b).data.attributes)
          .catch(() => null),
        tokenChart(mint, poolId, "1W"),
      ])
    : [null, null];

  const lifecycle = lifecycleFor(mint);
  const value: TokenDetail = {
    mint,
    symbol: entry.symbol,
    name: entry.name,
    description: entry.description ?? null,
    image: entry.image ?? null,
    issuerUrl: entry.external_url ?? null,
    markPrice: entry.markPrice,
    tokenPrice: entry.tokenPrice,
    markValuation: entry.markValuation ?? null,
    impliedValuation: entry.impliedValuation ?? null,
    multiplier: scale,
    pool: pool
      ? {
          name: pool.name,
          liquidityUsd: pool.reserve_in_usd ? Number(pool.reserve_in_usd) : null,
          change24hPct: pool.price_change_percentage.h24 ? Number(pool.price_change_percentage.h24) : null,
          buys24h: pool.transactions.h24.buys,
          sells24h: pool.transactions.h24.sells,
          buyers24h: pool.transactions.h24.buyers,
          sellers24h: pool.transactions.h24.sellers,
        }
      : null,
    poolId,
    candles: candles ?? [],
    lifecycle: lifecycle ? { state: lifecycle.state, deadline: lifecycle.deadline, statement: lifecycle.statement, issuerUrl: lifecycle.issuerUrl } : null,
    fetchedAt: new Date().toISOString(),
  };
  // A partial answer is served but not cached, so the next request retries the missing parts.
  if (pool && candles) details.set(mint, { at: Date.now(), value });
  return value;
}
