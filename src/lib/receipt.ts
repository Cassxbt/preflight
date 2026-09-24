import { USDC_MINT } from "./constants";
import { blocksUntilExpiry, connection } from "./solana";
import { get } from "./store";

type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };

export type Receipt = {
  signature: string;
  chainVerified: {
    found: boolean;
    // Not on chain and past its last valid block height: it can never execute.
    expired?: boolean;
    success?: boolean;
    blockTime?: string;
    slot?: number;
    feePayer?: string;
    usdcDebitedRaw?: string;
    tokenCreditedRaw?: string;
    networkFeeLamports?: number;
  };
  appRecorded: {
    orderId: string;
    checkedAt: string;
    status: string;
    reasons: { code: string; status: string; message: string }[];
    verdictHash: string;
    expectedNetOutRaw: string;
    expectedSolCostLamports: number;
    router: string;
    executeReported: { status: string; code: number; error?: string; totalInputAmount: string; totalOutputAmount: string; inputAmountResult: string; outputAmountResult: string } | null;
  } | null;
  issuerAttested: { catalogRetrievedAt: string | null; markPrice: number | null; lifecycle: unknown } | null;
  mint?: string;
  symbol?: string;
  wallet?: string;
  decimals?: number;
  multiplier?: number;
};

function delta(pre: TokenBalance[], post: TokenBalance[], owner: string, mint: string): bigint {
  const pick = (list: TokenBalance[]) =>
    list.filter((b) => b.owner === owner && b.mint === mint).reduce((sum, b) => sum + BigInt(b.uiTokenAmount.amount), 0n);
  return pick(post) - pick(pre);
}

export async function buildReceipt(signature: string): Promise<Receipt | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return null;
  const raw = await get("receipts", signature);
  const record = raw ? JSON.parse(raw) : null;
  const order = record?.order;

  const tx = await connection().getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const chainVerified: Receipt["chainVerified"] = { found: !!tx };
  if (tx) {
    const meta = tx.meta!;
    Object.assign(chainVerified, {
      success: meta.err === null,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined,
      slot: tx.slot,
      feePayer: tx.transaction.message.staticAccountKeys[0].toBase58(),
      networkFeeLamports: meta.fee,
    });
    if (order) {
      const pre = (meta.preTokenBalances ?? []) as TokenBalance[];
      const post = (meta.postTokenBalances ?? []) as TokenBalance[];
      chainVerified.usdcDebitedRaw = (-delta(pre, post, order.wallet, USDC_MINT)).toString();
      chainVerified.tokenCreditedRaw = delta(pre, post, order.wallet, order.mint).toString();
    }
  }

  const lastValid = Number(order?.route?.lastValidBlockHeight);
  if (!tx && Number.isFinite(lastValid)) chainVerified.expired = (await blocksUntilExpiry(lastValid)) < 0;

  if (!record && !tx) return null;
  return {
    signature,
    chainVerified,
    appRecorded: order
      ? {
          orderId: order.orderId,
          checkedAt: order.verdict?.checkedAt ?? order.createdAt,
          status: order.check.status,
          reasons: order.check.reasons.map((r: { code: string; status: string; message: string }) => ({ code: r.code, status: r.status, message: r.message })),
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
        }
      : null,
    issuerAttested: order ? order.verdict?.evidence ?? null : null,
    mint: order?.mint,
    symbol: order?.symbol,
    wallet: order?.wallet,
    decimals: order?.expected.decimals,
    multiplier: order?.expected.multiplier,
  };
}
