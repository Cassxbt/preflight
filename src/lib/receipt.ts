import bs58 from "bs58";
import { USDC_MINT } from "./constants";
import { blocksUntilExpiry, connection } from "./solana";
import { get } from "./store";

type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };

// A lagging RPC index must never make a landed purchase look expired.
const EXPIRY_MARGIN_BLOCKS = 32;

export type Receipt = {
  signature: string;
  chainVerified: {
    found: boolean;
    lookupError?: string;
    // Unknown to the cluster and well past its last valid block height: it can never execute.
    expired?: boolean;
    success?: boolean;
    blockTime?: string;
    slot?: number;
    feePayer?: string;
    usdcDebitedRaw?: string;
    tokenCreditedRaw?: string;
    walletSolSpentLamports?: number;
    networkFeeLamports?: number;
  };
  appRecorded: {
    orderId: string;
    checkedAt: string;
    status: string;
    reasons: { code: string; status: string; message: string }[];
    // Null for receipts written before acknowledgements were recorded.
    ackedReasons: string[] | null;
    verdict: unknown;
    verdictHash: string;
    expectedNetOutRaw: string;
    expectedSolCostLamports: number;
    router: string;
    executeReported: {
      status: string;
      code: number;
      error?: string;
      totalInputAmount: string;
      totalOutputAmount: string;
      inputAmountResult: string;
      outputAmountResult: string;
    } | null;
  };
  issuerAttested: { catalogRetrievedAt: string | null; markPrice: number | null; lifecycle: unknown } | null;
  mint: string;
  symbol?: string;
  wallet: string;
  decimals: number;
  multiplier: number;
};

export function isSignature(value: string): boolean {
  try {
    return bs58.decode(value).length === 64;
  } catch {
    return false;
  }
}

// Null when no balance entry names this owner, so a missing field is never shown as a zero delta.
function delta(pre: TokenBalance[], post: TokenBalance[], owner: string, mint: string): bigint | null {
  const matches = (b: TokenBalance) => b.owner === owner && b.mint === mint;
  if (!pre.some(matches) && !post.some(matches)) return null;
  const sum = (list: TokenBalance[]) => list.filter(matches).reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(post) - sum(pre);
}

// A confirmed transaction never changes, so its chain facts are read once per server instance.
const confirmed = new Map<string, Receipt["chainVerified"]>();

async function readChain(signature: string, wallet: string, mint: string, lastValid: number): Promise<Receipt["chainVerified"]> {
  const cached = confirmed.get(signature);
  if (cached) return cached;
  const conn = connection();
  try {
    const tx = await conn.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) {
      const [status] = (await conn.getSignatureStatuses([signature], { searchTransactionHistory: true })).value;
      const expired = !status && Number.isFinite(lastValid) && (await blocksUntilExpiry(lastValid)) < -EXPIRY_MARGIN_BLOCKS;
      return { found: false, expired };
    }
    const meta = tx.meta;
    const keys = tx.transaction.message.staticAccountKeys;
    const payerIndex = keys.findIndex((k) => k.toBase58() === wallet);
    const pre = (meta?.preTokenBalances ?? []) as TokenBalance[];
    const post = (meta?.postTokenBalances ?? []) as TokenBalance[];
    const usdc = delta(pre, post, wallet, USDC_MINT);
    const token = delta(pre, post, wallet, mint);
    const facts: Receipt["chainVerified"] = {
      found: true,
      success: meta ? meta.err === null : undefined,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined,
      slot: tx.slot,
      feePayer: keys[0].toBase58(),
      usdcDebitedRaw: usdc === null ? undefined : (-usdc).toString(),
      tokenCreditedRaw: token === null ? undefined : token.toString(),
      walletSolSpentLamports: meta && payerIndex >= 0 ? meta.preBalances[payerIndex] - meta.postBalances[payerIndex] : undefined,
      networkFeeLamports: meta?.fee,
    };
    confirmed.set(signature, facts);
    return facts;
  } catch (e) {
    return { found: false, lookupError: e instanceof Error ? e.message : "chain lookup failed" };
  }
}

// Only purchases that went through Preflight have receipts; anything else is not ours to describe.
export async function buildReceipt(signature: string): Promise<Receipt | null> {
  if (!isSignature(signature)) return null;
  const raw = await get("receipts", signature);
  if (!raw) return null;
  const record = JSON.parse(raw);
  const order = record.order;

  return {
    signature,
    chainVerified: await readChain(signature, order.wallet, order.mint, Number(order.route?.lastValidBlockHeight)),
    appRecorded: {
      orderId: order.orderId,
      checkedAt: order.verdict?.checkedAt ?? order.createdAt,
      status: order.check.status,
      reasons: order.check.reasons.map((r: { code: string; status: string; message: string }) => ({ code: r.code, status: r.status, message: r.message })),
      ackedReasons: record.ackedReasons ?? null,
      verdict: order.verdict ?? null,
      verdictHash: order.verdictHash,
      expectedNetOutRaw: order.expected.netOutRaw,
      expectedSolCostLamports: order.expected.walletSolCostLamports,
      router: order.route.router,
      executeReported: record.execute
        ? {
            status: record.execute.status,
            code: record.execute.code,
            error: record.execute.error,
            totalInputAmount: record.execute.totalInputAmount,
            totalOutputAmount: record.execute.totalOutputAmount,
            inputAmountResult: record.execute.inputAmountResult,
            outputAmountResult: record.execute.outputAmountResult,
          }
        : null,
    },
    issuerAttested: order.verdict?.evidence ?? null,
    mint: order.mint,
    symbol: order.symbol,
    wallet: order.wallet,
    decimals: order.expected.decimals,
    multiplier: order.expected.multiplier,
  };
}
