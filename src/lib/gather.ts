import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { fetchCatalog, findExact } from "./catalog";
import { runCheck, type CheckInput, type Outcome } from "./check";
import { USDC_MINT } from "./constants";
import { serverEnv } from "./env";
import { metaOrder, type MetaOrder } from "./jupiter";
import { verifyIssuerEvidence } from "./issuer";
import { lifecycleFor, type LifecycleEntry } from "./lifecycle";
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

export function parsePublicKey(value: string): string {
  return new PublicKey(value).toBase58();
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

function lifecycleInputs(entry: LifecycleEntry | undefined): Pick<CheckInput, "retired" | "deadlineAhead"> {
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

// Never quotes or builds a transaction, so it is safe to call without a wallet.
export async function gatherPreview(mint: string): Promise<{ input: CheckInput; symbol?: string; mintState?: MintState }> {
  const lifecycle = lifecycleFor(mint);
  const [catalog, mintState, issuer] = await Promise.all([
    settle(fetchCatalog),
    settle(() => readMintState(mint)),
    lifecycle ? settle(() => verifyIssuerEvidence(lifecycle)) : Promise.resolve(undefined),
  ]);
  const entry = catalog.ok ? findExact(catalog.value, mint) : undefined;
  const sameSymbol = lifecycle && catalog.ok ? catalog.value.entries.find((e) => e.symbol === lifecycle.symbol) : undefined;
  return {
    symbol: entry?.symbol,
    mintState: mintState.ok ? mintState.value : undefined,
    input: {
      mint,
      now: new Date().toISOString(),
      ...lifecycleInputs(lifecycle),
      issuer,
      catalog: catalog.ok
        ? {
            ok: true,
            value: {
              listed: !!entry,
              symbol: entry?.symbol,
              markPrice: entry?.markPrice,
              tokenPrice: entry?.tokenPrice,
              retrievedAt: catalog.value.retrievedAt,
              mintForLifecycleSymbol: sameSymbol?.contract_address ?? null,
            },
          }
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
  destRentLamports: number;
  simulationError?: string;
};

class NoRouteError extends Error {}

async function tokenAccount(wallet: string, mint: string, tokenProgram: string) {
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(wallet), false, new PublicKey(tokenProgram));
  const info = await connection().getParsedAccountInfo(ata);
  if (!info.value) return { address: ata.toBase58(), exists: false, frozen: false, amountRaw: 0n };
  const parsed = (info.value.data as { parsed?: { info?: { state?: string; tokenAmount?: { amount?: string } } } }).parsed?.info;
  if (!parsed?.state || parsed.tokenAmount?.amount === undefined) throw new Error(`Token account ${ata.toBase58()} could not be decoded`);
  return { address: ata.toBase58(), exists: true, frozen: parsed.state === "frozen", amountRaw: BigInt(parsed.tokenAmount.amount) };
}

// Jupiter's automatic slippage sometimes lands at or below the token's own transfer fee,
// which makes the swap revert on chain (measured: 100 bps against a 1% fee failed 2 of 3 simulations).
export async function orderWithSlippageFloor(mint: string, wallet: string, usdcRaw: bigint, floorBps: number): Promise<MetaOrder> {
  const req = { inputMint: USDC_MINT, outputMint: mint, amount: usdcRaw, taker: wallet };
  const order = await metaOrder(req);
  if (order.slippageBps === undefined || order.slippageBps >= floorBps) return order;
  return metaOrder({ ...req, slippageBps: floorBps });
}

// Tokens per dollar at this size versus a $1 quote on the same router. Jupiter's own priceImpact
// field is a USD-value delta that already includes the transfer fee, so it reads ~2-3% even at $1.
// Returns null (not evaluated) when the reference quote took a different router.
export async function sizeImpactPct(mint: string, usdcRaw: bigint, outRaw: bigint, router: string): Promise<number | null> {
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

async function quoteAndSimulate(
  mint: string,
  wallet: string,
  usdcRaw: bigint,
  accounts: { dest: { address: string; exists: boolean; amountRaw: bigint }; usdcAddress: string },
  slippageFloorBps: number,
): Promise<PreparedQuote> {
  const order = await orderWithSlippageFloor(mint, wallet, usdcRaw, slippageFloorBps);
  if (!order.transaction) throw new NoRouteError(order.errorMessage ?? "no route");
  const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  // Submission verifies the ordering wallet's signature in the fee-payer slot, so only offer such transactions.
  if (tx.message.staticAccountKeys[0].toBase58() !== wallet) throw new Error(`route ${order.router} needs a different fee payer`);

  const conn = connection();
  const [solBefore, usdcBefore] = await Promise.all([
    conn.getBalance(new PublicKey(wallet)),
    tokenAccount(wallet, USDC_MINT, TOKEN_PROGRAM_ID).then((a) => a.amountRaw),
  ]);
  const sim = await simulate(tx, [wallet, accounts.dest.address, accounts.usdcAddress]);
  const [w, d, u] = sim.accounts;
  const creditRaw = (d.tokenAmountRaw ?? 0n) - accounts.dest.amountRaw;
  const debitRaw = usdcBefore - (u.tokenAmountRaw ?? 0n);

  let simulationError = sim.err ? JSON.stringify(sim.err) : undefined;
  if (!simulationError && creditRaw <= 0n) simulationError = "the swap credits no tokens to your account";
  if (!simulationError && debitRaw !== usdcRaw) simulationError = `the swap debits ${Number(debitRaw) / 1e6} USDC, not the ${Number(usdcRaw) / 1e6} ordered`;

  return {
    order,
    tx,
    creditRaw,
    minOutRaw: BigInt(order.otherAmountThreshold ?? "0"),
    walletSolCostLamports: solBefore - w.lamports,
    destRentLamports: accounts.dest.exists ? 0 : d.lamports,
    simulationError,
  };
}

// Lower is better: dollars spent per token received, counting the SOL the wallet pays.
function costPerToken(q: PreparedQuote, usdcRaw: bigint, solUsd: number | null): number {
  const solCostUsd = solUsd !== null ? (q.walletSolCostLamports / 1e9) * solUsd : 0;
  return (Number(usdcRaw) / 1e6 + solCostUsd) / Number(q.creditRaw);
}

export async function gatherForOrder(mint: string, wallet: string, usdcRaw: bigint, maxQuotes = 3) {
  const preview = await gatherPreview(mint);
  const input: CheckInput = { ...preview.input };
  const tokenProgram = preview.mintState?.program ?? TOKEN_PROGRAM_ID;
  const [dest, usdc] = await Promise.all([
    settle(() => tokenAccount(wallet, mint, tokenProgram)),
    settle(() => tokenAccount(wallet, USDC_MINT, TOKEN_PROGRAM_ID)),
  ]);
  input.destAccount = dest.ok ? { ok: true, value: { exists: dest.value.exists, frozen: dest.value.frozen } } : dest;
  input.funds = usdc.ok ? { ok: true, value: { usdcBalanceRaw: usdc.value.amountRaw, usdcRequiredRaw: usdcRaw } } : usdc;

  if (!dest.ok || !usdc.ok || runCheck(input).status === "HOLD") return { input, prepared: undefined };

  const price = await solUsd();
  input.policy = { ...COST_POLICY, solUsd: price };
  const slippageFloorBps = (preview.mintState?.transferFee?.bps ?? 0) + 100;
  const accounts = { dest: dest.value, usdcAddress: usdc.value.address };

  let best: PreparedQuote | undefined;
  let failure: { kind: "no-route" | "simulation" | "source"; detail: string } | undefined;
  for (let i = 0; i < maxQuotes; i++) {
    const attempt = await quoteAndSimulate(mint, wallet, usdcRaw, accounts, slippageFloorBps).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    if (!attempt.ok) {
      const detail = attempt.error instanceof Error ? attempt.error.message : String(attempt.error);
      failure = { kind: attempt.error instanceof NoRouteError ? "no-route" : "source", detail };
      continue;
    }
    const q = attempt.value;
    if (q.simulationError) {
      if (!best) failure = { kind: "simulation", detail: q.simulationError };
      continue;
    }
    if (!best || costPerToken(q, usdcRaw, price) <= costPerToken(best, usdcRaw, price)) best = q;
    // Rent for a first-time token account is unavoidable, so it never justifies another quote.
    if (best.walletSolCostLamports - best.destRentLamports <= COST_POLICY.maxSolCostLamports) break;
  }

  if (!best) {
    const none = { sizeImpactPct: null, usdcInRaw: usdcRaw, netOutRaw: 0n, minOutRaw: null };
    if (failure?.kind === "no-route") {
      input.quote = { ok: true, value: { hasRoute: false, detail: failure.detail, ...none } };
    } else if (failure?.kind === "simulation") {
      input.quote = { ok: true, value: { hasRoute: true, ...none } };
      input.simulation = { ok: true, value: { succeeded: false, creditRaw: 0n, walletSolCostLamports: 0, error: failure.detail } };
    } else {
      input.quote = { ok: false, error: failure?.detail ?? "no quote" };
    }
    return { input, prepared: undefined };
  }

  const impact = await sizeImpactPct(mint, usdcRaw, BigInt(best.order.outAmount), best.order.router);
  input.quote = {
    ok: true,
    value: { hasRoute: true, sizeImpactPct: impact, usdcInRaw: usdcRaw, netOutRaw: best.creditRaw, minOutRaw: best.minOutRaw > 0n ? best.minOutRaw : null },
  };
  input.simulation = { ok: true, value: { succeeded: true, creditRaw: best.creditRaw, walletSolCostLamports: best.walletSolCostLamports } };
  return { input, prepared: best, destAddress: dest.value.address };
}
