import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { metaExecute } from "./jupiter";
import { blocksUntilExpiry } from "./solana";
import { get, put } from "./store";
import { submitSignedOrder } from "./submit";

vi.mock("./jupiter", () => ({ metaExecute: vi.fn() }));
vi.mock("./solana", () => ({ blocksUntilExpiry: vi.fn(), SUBMIT_MARGIN_BLOCKS: 12 }));
const execute = vi.mocked(metaExecute);
const blocksLeft = vi.mocked(blocksUntilExpiry);

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

async function storedOrder(reasons: { code: string; status: string; message: string }[] = []) {
  const payer = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 })],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  const orderId = `test-${Math.random().toString(36).slice(2, 12)}`;
  await put(
    "orders",
    orderId,
    JSON.stringify({
      orderId,
      expiresAt: new Date(Date.now() + 45_000).toISOString(),
      wallet: payer.publicKey.toBase58(),
      check: { status: reasons.length ? "DISCLOSE" : "CLEAR", reasons },
      route: { requestId: "req-1", lastValidBlockHeight: "1000" },
      messageBase64: b64(message.serialize()),
    }),
  );
  tx.sign([payer]);
  return { orderId, signed: b64(tx.serialize()), signature: bs58.encode(tx.signatures[0]), payer };
}

const SUCCESS = {
  status: "Success" as const,
  signature: "",
  code: 0,
  totalInputAmount: "2000000",
  totalOutputAmount: "1927000",
  inputAmountResult: "2000000",
  outputAmountResult: "1927000",
};

beforeEach(() => {
  process.env.PREFLIGHT_DATA_DIR = mkdtempSync(path.join(tmpdir(), "preflight-test-"));
  execute.mockReset();
  blocksLeft.mockReset();
  blocksLeft.mockResolvedValue(60);
});

describe("submitSignedOrder", () => {
  it("keeps the signature and a receipt when Jupiter's answer is lost, and refuses a second buy", async () => {
    const { orderId, signed, signature } = await storedOrder();
    execute.mockRejectedValueOnce(new Error("timeout"));

    const first = await submitSignedOrder(orderId, signed, []);
    expect(first).toMatchObject({ ok: false, code: "OUTCOME_UNKNOWN", signature });

    const receipt = JSON.parse((await get("receipts", signature))!);
    expect(receipt).toMatchObject({ orderId, signature, execute: null });

    const second = await submitSignedOrder(orderId, signed, []);
    expect(second).toMatchObject({ ok: false, code: "ALREADY_SUBMITTED", signature });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("lets exactly one of two parallel submissions reach Jupiter", async () => {
    const { orderId, signed, signature } = await storedOrder();
    execute.mockResolvedValue({ ...SUCCESS, signature });

    const results = await Promise.all([submitSignedOrder(orderId, signed, []), submitSignedOrder(orderId, signed, [])]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(results.map((r) => (r.ok ? "ok" : r.code)).sort()).toEqual(["ALREADY_SUBMITTED", "ok"]);
  });

  it("records Jupiter's result on the receipt after a normal execute", async () => {
    const { orderId, signed, signature } = await storedOrder();
    execute.mockResolvedValueOnce({ ...SUCCESS, signature });

    expect(await submitSignedOrder(orderId, signed, [])).toMatchObject({ ok: true, signature });
    const receipt = JSON.parse((await get("receipts", signature))!);
    expect(receipt.execute).toMatchObject({ status: "Success", outputAmountResult: "1927000" });
  });

  it("rejects a transaction whose message differs from the checked one, before any claim", async () => {
    const { orderId } = await storedOrder();
    const other = await storedOrder();

    expect(await submitSignedOrder(orderId, other.signed, [])).toMatchObject({ ok: false, code: "MESSAGE_CHANGED" });
    expect(await get("orders", `${orderId}-submitted`)).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a route past its block height without broadcasting or burning the order", async () => {
    const { orderId, signed } = await storedOrder();
    blocksLeft.mockResolvedValueOnce(12);

    expect(await submitSignedOrder(orderId, signed, [])).toMatchObject({ ok: false, code: "ORDER_EXPIRED" });
    expect(execute).not.toHaveBeenCalled();
    expect(await get("orders", `${orderId}-submitted`)).toBeNull();
  });

  it("requires every disclosed reason to be acknowledged", async () => {
    const { orderId, signed } = await storedOrder([{ code: "ABOVE_MARK", status: "DISCLOSE", message: "above mark" }]);

    expect(await submitSignedOrder(orderId, signed, [])).toMatchObject({ ok: false, code: "NOT_ACKNOWLEDGED" });
    expect(execute).not.toHaveBeenCalled();
  });
});
