import { randomBytes } from "node:crypto";
import { canonicalJson, sha256Hex } from "./canonical";
import { runCheck, type CheckResult } from "./check";
import { MAX_ORDER_USDC } from "./constants";
import { gatherForOrder, parsePublicKey } from "./gather";
import { blocksUntilExpiry, MIN_SECONDS_PER_BLOCK, SUBMIT_MARGIN_BLOCKS } from "./solana";
import { get, put } from "./store";

// Our own ceiling on how long an acknowledged order may wait for a signature.
const ORDER_TTL_MS = 45_000;
const MIN_SIGNING_WINDOW_MS = 10_000;

// Jupiter's transaction dies at lastValidBlockHeight (measured: ~98 blocks, 35-40 s, after it is built),
// so the window shown to the user must come from the chain, not from our own TTL alone.
async function signingWindowMs(lastValidBlockHeight: number | string | undefined, expireAt: string | undefined): Promise<number> {
  let window = ORDER_TTL_MS;
  const height = Number(lastValidBlockHeight);
  if (Number.isFinite(height)) {
    const blocks = (await blocksUntilExpiry(height)) - SUBMIT_MARGIN_BLOCKS;
    window = Math.min(window, blocks * MIN_SECONDS_PER_BLOCK * 1000);
  }
  if (expireAt) window = Math.min(window, Date.parse(expireAt) - Date.now() - SUBMIT_MARGIN_BLOCKS * MIN_SECONDS_PER_BLOCK * 1000);
  return window;
}

export type StoredOrder = {
  schema: "preflight.order.v1";
  orderId: string;
  createdAt: string;
  expiresAt: string;
  mint: string;
  symbol?: string;
  wallet: string;
  usdcInRaw: string;
  check: CheckResult;
  verdictHash: string;
  route: { router: string; requestId: string; feeBps: number; feeMint: string; slippageBps?: number; lastValidBlockHeight?: number; expireAt?: string };
  mark: { price: number | null; retrievedAt: string | null };
  expected: { netOutRaw: string; minOutRaw: string; walletSolCostLamports: number; decimals: number; multiplier: number; feeBps: number | null };
  unsignedTx: string;
  messageBase64: string;
};

export type OrderResponse =
  | { ok: true; order: Omit<StoredOrder, "unsignedTx" | "messageBase64" | "route"> & { transaction: string; router: string } }
  | { ok: false; status: "HOLD" | "ERROR"; check?: CheckResult; error?: string };

export function usdcToRaw(usdc: number): bigint {
  if (!Number.isFinite(usdc) || usdc <= 0) throw new Error("Amount must be a positive number of USDC");
  if (usdc > MAX_ORDER_USDC) throw new Error(`Amount exceeds the ${MAX_ORDER_USDC} USDC per-order limit`);
  return BigInt(Math.round(usdc * 1e6));
}

export async function createFinalOrder(mintInput: string, walletInput: string, usdc: number): Promise<OrderResponse> {
  const mint = parsePublicKey(mintInput);
  const wallet = parsePublicKey(walletInput);
  const usdcRaw = usdcToRaw(usdc);

  const { input, prepared } = await gatherForOrder(mint, wallet, usdcRaw);
  const check = runCheck(input);

  if (check.status === "HOLD" || !check.signAvailable || !prepared) {
    return { ok: false, status: "HOLD", check };
  }

  const windowMs = await signingWindowMs(prepared.order.lastValidBlockHeight, prepared.order.expireAt);
  if (!(windowMs >= MIN_SIGNING_WINDOW_MS)) {
    return { ok: false, status: "ERROR", error: "The route went stale while it was being checked. Prepare the order again." };
  }

  const now = Date.now();
  const orderId = randomBytes(12).toString("base64url");
  const verdict = {
    schema: "preflight.verdict.v1",
    orderId,
    mint,
    wallet,
    usdcInRaw: usdcRaw,
    checkedAt: new Date(now).toISOString(),
    status: check.status,
    reasons: check.reasons,
    notEvaluated: check.notEvaluated,
    metrics: check.metrics,
    evidence: {
      catalogRetrievedAt: input.catalog.ok ? input.catalog.value.retrievedAt : null,
      markPrice: input.catalog.ok ? input.catalog.value.markPrice : null,
      lifecycle: input.retired ?? input.deadlineAhead ?? null,
    },
    route: { router: prepared.order.router, requestId: prepared.order.requestId },
    expectedNetOutRaw: prepared.creditRaw,
    guaranteedMinOutRaw: prepared.minOutRaw,
  };

  const mintState = input.mintState.ok ? input.mintState.value : null;
  const stored: StoredOrder = {
    schema: "preflight.order.v1",
    orderId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + windowMs).toISOString(),
    mint,
    symbol: input.catalog.ok ? input.catalog.value.symbol : undefined,
    wallet,
    usdcInRaw: usdcRaw.toString(),
    check,
    verdictHash: sha256Hex(canonicalJson(verdict)),
    route: {
      router: prepared.order.router,
      requestId: prepared.order.requestId,
      feeBps: prepared.order.feeBps,
      feeMint: prepared.order.feeMint,
      slippageBps: prepared.order.slippageBps,
      lastValidBlockHeight: prepared.order.lastValidBlockHeight,
      expireAt: prepared.order.expireAt,
    },
    mark: {
      price: input.catalog.ok ? (input.catalog.value.markPrice ?? null) : null,
      retrievedAt: input.catalog.ok ? input.catalog.value.retrievedAt : null,
    },
    expected: {
      netOutRaw: prepared.creditRaw.toString(),
      minOutRaw: prepared.minOutRaw.toString(),
      walletSolCostLamports: prepared.walletSolCostLamports,
      decimals: mintState?.decimals ?? 0,
      multiplier: mintState?.multiplier ?? 1,
      feeBps: mintState?.feeBps ?? null,
    },
    unsignedTx: Buffer.from(prepared.tx.serialize()).toString("base64"),
    messageBase64: Buffer.from(prepared.tx.message.serialize()).toString("base64"),
  };
  await put("orders", orderId, canonicalJson({ ...stored, verdict }));

  const { unsignedTx, messageBase64: _message, route, ...publicFields } = stored;
  return { ok: true, order: { ...publicFields, transaction: unsignedTx, router: route.router } };
}

export async function loadOrder(orderId: string): Promise<(StoredOrder & { verdict: unknown }) | null> {
  const raw = await get("orders", orderId);
  return raw ? JSON.parse(raw) : null;
}
