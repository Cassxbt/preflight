import { ed25519 } from "@noble/curves/ed25519.js";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { canonicalJson } from "./canonical";
import { metaExecute, type ExecuteResult } from "./jupiter";
import { loadOrder } from "./order";
import { blocksUntilExpiry, SUBMIT_MARGIN_BLOCKS } from "./solana";
import { create, put } from "./store";

export type SubmitResult =
  | { ok: true; signature: string; execute: ExecuteResult }
  | { ok: false; code: string; error: string; signature?: string };

export async function submitSignedOrder(orderId: string, signedTxBase64: string, ackedReasons: string[]): Promise<SubmitResult> {
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, code: "ORDER_NOT_FOUND", error: "Unknown or already discarded order." };
  if (!(Date.now() <= Date.parse(order.expiresAt))) {
    return { ok: false, code: "ORDER_EXPIRED", error: "This order expired before it was signed. Prepare a new order." };
  }

  const required = order.check.reasons.filter((r) => r.status === "DISCLOSE").map((r) => r.code);
  const missing = required.filter((code) => !ackedReasons.includes(code));
  if (missing.length) return { ok: false, code: "NOT_ACKNOWLEDGED", error: `Acknowledge before signing: ${missing.join(", ")}` };

  let signed: VersionedTransaction;
  try {
    signed = VersionedTransaction.deserialize(Buffer.from(signedTxBase64, "base64"));
  } catch {
    return { ok: false, code: "INVALID_TRANSACTION", error: "Signed transaction could not be decoded." };
  }

  const message = Buffer.from(signed.message.serialize());
  if (!message.equals(Buffer.from(order.messageBase64, "base64"))) {
    return {
      ok: false,
      code: "MESSAGE_CHANGED",
      error: "The wallet returned a different transaction than the one Preflight checked. Nothing was sent.",
    };
  }

  const payerIndex = signed.message.staticAccountKeys.findIndex((k) => k.toBase58() === order.wallet);
  const payerSig = payerIndex >= 0 ? signed.signatures[payerIndex] : undefined;
  const payerKey = signed.message.staticAccountKeys[payerIndex]?.toBytes();
  if (payerIndex !== 0 || !payerSig || !payerKey || !ed25519.verify(payerSig, message, payerKey)) {
    return { ok: false, code: "BAD_SIGNATURE", error: "The transaction is not validly signed by the ordering wallet." };
  }

  // Checked against the chain, not our clock: a transaction past its block height can never land,
  // so sending it would only burn the order.
  const lastValid = Number(order.route.lastValidBlockHeight);
  if (Number.isFinite(lastValid) && (await blocksUntilExpiry(lastValid)) <= SUBMIT_MARGIN_BLOCKS) {
    return { ok: false, code: "ORDER_EXPIRED", error: "The route expired before the signature arrived. Nothing was sent. Prepare a new order." };
  }

  // The signature is fixed by the signed bytes, so it is known before anything is broadcast.
  // The receipt is written before the lock, so a lock never exists without a receipt to reconcile it on chain;
  // a failed write leaves neither, nothing sent, and a clean retry.
  const signature = bs58.encode(payerSig);
  const record = {
    schema: "preflight.receipt.v1",
    orderId,
    signature,
    submittedAt: new Date().toISOString(),
    ackedReasons: required.filter((code) => ackedReasons.includes(code)).sort(),
    order: { ...order, unsignedTx: undefined, messageBase64: undefined },
    execute: null as ExecuteResult | null,
  };
  // A parallel submit signed these same bytes, so an existing receipt is this one and must not be overwritten.
  await create("receipts", signature, canonicalJson(record));
  if (!(await create("locks", orderId, JSON.stringify({ signature, at: new Date().toISOString() })))) {
    return { ok: false, code: "ALREADY_SUBMITTED", error: "This order was already submitted. Check its receipt before buying again.", signature };
  }

  let execute: ExecuteResult;
  try {
    execute = await metaExecute(Buffer.from(signed.serialize()).toString("base64"), order.route.requestId);
  } catch {
    return {
      ok: false,
      code: "OUTCOME_UNKNOWN",
      error: "Jupiter did not confirm the result. The purchase may still land. Do not buy again; open the receipt to see what happened on chain.",
      signature,
    };
  }

  // Past this point the transaction may be on chain, so a failed write must not turn into an error response.
  await put("receipts", signature, canonicalJson({ ...record, execute, jupiterSignatureMatches: execute.signature === signature })).catch(() => {});
  if (execute.status !== "Success") {
    return { ok: false, code: `EXECUTE_${execute.code}`, error: execute.error ?? "Jupiter reported the swap failed.", signature };
  }
  return { ok: true, signature, execute };
}
