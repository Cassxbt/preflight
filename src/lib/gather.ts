import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { fetchCatalog, findExact } from "./catalog";
import type { CheckInput, Outcome } from "./check";
import { USDC_MINT } from "./constants";
import { serverEnv } from "./env";
import { metaOrder, type MetaOrder } from "./jupiter";
import { lifecycleFor } from "./lifecycle";
import { readMintState, type MintState } from "./mintState";
import { connection, simulate } from "./solana";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export const COST_POLICY = { maxSolCostLamports: 50_000, maxSolCostPctOfOrder: 0.5 };

async function settle<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseMint(mint: string): string {
  const key = new PublicKey(mint);
  return key.toBase58();
}

async function solUsd(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${SOL_MINT}`, {
      headers: { "x-api-key": serverEnv.jupiterApiKey() },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as Record<string, { usdPrice?: number }>;
    return body[SOL_MINT]?.usdPrice ?? null;
  } catch {
    return null;
  }
}

function lifecycleInputs(mint: string): Pick<CheckInput, "retired" | "deadlineAhead"> {
  const entry = lifecycleFor(mint);
  if (!entry) return {};
  const evidence = {
    symbol: entry.symbol,
    deadline: entry.deadline,
    issuerUrl: entry.issuerUrl,
    statement: entry.statement,
    capturedAt: entry.capturedAt,
    sha256: entry.sha256,
  };
  const passed = Date.parse(entry.deadline) <= Date.now();
  return entry.state === "window_closed" || passed ? { retired: evidence } : { deadlineAhead: evidence };
}

function toCheckMint(state: MintState) {
  return { paused: state.paused, decimals: state.decimals, multiplier: state.multiplier, feeBps: state.transferFee?.bps ?? null };
}

// Wallet-free preview: identity, lifecycle, mint state. No quote, no transaction.
export async function gatherPreview(mint: string): Promise<{ input: CheckInput; symbol?: string; mintState?: MintState }> {
  const [catalog, mintState] = await Promise.all([settle(fetchCatalog), settle(() => readMintState(mint))]);
  const entry = catalog.ok ? findExact(catalog.value, mint) : undefined;
  return {
    symbol: entry?.symbol,
    mintState: mintState.ok ? mintState.value : undefined,
    input: {
      mint,
      now: new Date().toISOString(),
      ...lifecycleInputs(mint),
      catalog: catalog.ok
        ? { ok: true, value: { listed: !!entry, symbol: entry?.symbol, markPrice: entry?.markPrice, retrievedAt: catalog.value.retrievedAt } }
        : catalog,
      mintState: mintState.ok ? { ok: true, value: toCheckMint(mintState.value) } : mintState,
    },
  };
}

export type PreparedQuote = {
  order: MetaOrder;
  tx: VersionedTransaction;
  creditRaw: bigint;
  minOutRaw: bigint;
  walletSolCostLamports: number;
  simulationError?: string;
};

async function destinationAccount(wallet: string, mint: string, tokenProgram: string) {
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(wallet), false, new PublicKey(tokenProgram));
  const info = await connection().getParsedAccountInfo(ata);
  const parsed = info.value?.data as { parsed?: { info: { state: string; tokenAmount: { amount: string } } } } | undefined;
  return {
    address: ata.toBase58(),
    exists: !!info.value,
    frozen: parsed?.parsed?.info.state === "frozen",
    amountRaw: BigInt(parsed?.parsed?.info.tokenAmount.amount ?? "0"),
  };
}

// Jupiter's automatic slippage sometimes lands at or below the token's own transfer fee,
// which makes the swap revert on chain (measured: 100 bps against a 1% fee failed 2 of 3 simulations).
async function orderWithSlippageFloor(mint: string, wallet: string, usdcRaw: bigint, floorBps: number): Promise<MetaOrder> {
  const req = { inputMint: USDC_MINT, outputMint: mint, amount: usdcRaw, taker: wallet };
  const order = await metaOrder(req);
  if (order.slippageBps === undefined || order.slippageBps >= floorBps) return order;
  return metaOrder({ ...req, slippageBps: floorBps });
}

// Tokens per dollar at this size versus a $1 quote on the same router. Jupiter's own priceImpact
// field is a USD-value delta that already includes the transfer fee, so it reads ~2-3% even at $1.
// Returns null (not evaluated) when the reference quote took a different router.
async function sizeImpactPct(mint: string, usdcRaw: bigint, outRaw: bigint, router: string): Promise<number | null> {
  const refUsdcRaw = 1_000_000n;
  if (usdcRaw <= refUsdcRaw) return 0;
  try {
    const ref = await metaOrder({ inputMint: USDC_MINT, outputMint: mint, amount: refUsdcRaw });
    if (ref.router !== router) return null;
    const refPerUsdc = Number(ref.outAmount) / Number(refUsdcRaw);
    const perUsdc = Number(outRaw) / Number(usdcRaw);
    return refPerUsdc > 0 ? (1 - perUsdc / refPerUsdc) * 100 : null;
  } catch {
    return null;
  }
}

// Quotes and dry-runs one order for this wallet. Nothing is signed or sent.
async function quoteAndSimulate(
  mint: string,
  wallet: string,
  usdcRaw: bigint,
  dest: { address: string; amountRaw: bigint },
  slippageFloorBps: number,
): Promise<PreparedQuote> {
  const order = await orderWithSlippageFloor(mint, wallet, usdcRaw, slippageFloorBps);
  if (!order.transaction) {
    throw new Error(`No transaction from Jupiter (${order.router} code ${order.errorCode}: ${order.errorMessage ?? "unknown"})`);
  }
  const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  const conn = connection();
  const solBefore = await conn.getBalance(new PublicKey(wallet));
  const sim = await simulate(tx, [wallet, dest.address]);
  const [w, d] = sim.accounts;
  return {
    order,
    tx,
    creditRaw: (d.tokenAmountRaw ?? 0n) - dest.amountRaw,
    minOutRaw: BigInt(order.otherAmountThreshold ?? "0"),
    walletSolCostLamports: solBefore - w.lamports,
    simulationError: sim.err ? JSON.stringify(sim.err) : undefined,
  };
}

// Full gather for a final order: everything re-fetched now, for this wallet and amount.
export async function gatherForOrder(mint: string, wallet: string, usdcRaw: bigint, maxQuotes = 3) {
  const preview = await gatherPreview(mint);
  const input: CheckInput = { ...preview.input };
  const tokenProgram = preview.mintState?.program ?? TOKEN_PROGRAM_ID;
  const dest = await settle(() => destinationAccount(wallet, mint, tokenProgram));
  input.destAccount = dest.ok ? { ok: true, value: { exists: dest.value.exists, frozen: dest.value.frozen } } : dest;

  const blocked = input.retired || (input.catalog.ok && !input.catalog.value.listed) || !dest.ok;
  if (blocked) return { input, prepared: undefined };

  const price = await solUsd();
  input.policy = { ...COST_POLICY, solUsd: price };
  const slippageFloorBps = (preview.mintState?.transferFee?.bps ?? 0) + 100;

  let best: PreparedQuote | undefined;
  let lastError: string | undefined;
  for (let i = 0; i < maxQuotes; i++) {
    const attempt = await settle(() => quoteAndSimulate(mint, wallet, usdcRaw, dest.value, slippageFloorBps));
    if (!attempt.ok) {
      lastError = attempt.error;
      continue;
    }
    const q = attempt.value;
    if (!q.simulationError && (!best || q.walletSolCostLamports < best.walletSolCostLamports)) best = q;
    if (!q.simulationError && q.walletSolCostLamports <= COST_POLICY.maxSolCostLamports) break;
    if (q.simulationError && !best) lastError = `simulation: ${q.simulationError}`;
  }

  if (!best) {
    input.quote = lastError?.startsWith("simulation:")
      ? { ok: true, value: { hasRoute: true, sizeImpactPct: null, usdcInRaw: usdcRaw, netOutRaw: 0n } }
      : { ok: false, error: lastError ?? "no quote" };
    input.simulation = lastError?.startsWith("simulation:")
      ? { ok: true, value: { succeeded: false, creditRaw: 0n, walletSolCostLamports: 0, error: lastError } }
      : undefined;
    return { input, prepared: undefined };
  }

  const impact = await sizeImpactPct(mint, usdcRaw, BigInt(best.order.outAmount), best.order.router);
  input.quote = { ok: true, value: { hasRoute: true, sizeImpactPct: impact, usdcInRaw: usdcRaw, netOutRaw: best.creditRaw } };
  input.simulation = { ok: true, value: { succeeded: true, creditRaw: best.creditRaw, walletSolCostLamports: best.walletSolCostLamports } };
  return { input, prepared: best, destAddress: dest.value.address };
}
