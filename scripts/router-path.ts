// Route A (Jupiter Router /build + memo), kept only to reproduce the M1 route measurement
// that chose the Meta-Aggregator. The app itself never builds Router transactions.
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { JUPITER_SWAP_BASE } from "../src/lib/constants";
import { serverEnv } from "../src/lib/env";
import { connection } from "../src/lib/solana";

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const COMPUTE_UNIT_LIMIT_MAX = 1_400_000;

export type ApiInstruction = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};

export type RouterBuild = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  routePlan: { percent: number; swapInfo: { label: string; ammKey: string } }[];
  computeBudgetInstructions: ApiInstruction[];
  setupInstructions: ApiInstruction[];
  swapInstruction: ApiInstruction;
  cleanupInstruction: ApiInstruction | null;
  otherInstructions: ApiInstruction[];
  tipInstruction: ApiInstruction | null;
  addressesByLookupTableAddress: Record<string, string[]> | null;
  blockhashWithMetadata: { blockhash: number[]; lastValidBlockHeight: number };
};

type SwapRequest = { inputMint: string; outputMint: string; amount: bigint; taker: string };

export async function routerBuild(req: SwapRequest, slippageBps: number): Promise<RouterBuild> {
  const params = new URLSearchParams({
    inputMint: req.inputMint,
    outputMint: req.outputMint,
    amount: req.amount.toString(),
    taker: req.taker,
    slippageBps: String(slippageBps),
  });
  const res = await fetch(`${JUPITER_SWAP_BASE}/build?${params}`, { headers: { "x-api-key": serverEnv.jupiterApiKey() } });
  if (!res.ok) throw new Error(`Jupiter /build ${res.status}: ${await res.text()}`);
  return res.json() as Promise<RouterBuild>;
}

function toInstruction(ix: ApiInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

function memoInstruction(text: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [],
    data: Buffer.from(text, "utf8"),
  });
}

function lookupTables(raw: RouterBuild["addressesByLookupTableAddress"]): AddressLookupTableAccount[] {
  if (!raw) return [];
  return Object.entries(raw).map(
    ([key, addresses]) =>
      new AddressLookupTableAccount({
        key: new PublicKey(key),
        state: {
          deactivationSlot: BigInt("18446744073709551615"),
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          addresses: addresses.map((a) => new PublicKey(a)),
        },
      }),
  );
}

export function assembleRouterTransaction(
  build: RouterBuild,
  payer: string,
  memo: string | null,
  computeUnitLimit = COMPUTE_UNIT_LIMIT_MAX,
): VersionedTransaction {
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
    ...build.computeBudgetInstructions.map(toInstruction),
    ...build.setupInstructions.map(toInstruction),
    toInstruction(build.swapInstruction),
    ...(memo ? [memoInstruction(memo)] : []),
    ...(build.cleanupInstruction ? [toInstruction(build.cleanupInstruction)] : []),
    ...build.otherInstructions.map(toInstruction),
    ...(build.tipInstruction ? [toInstruction(build.tipInstruction)] : []),
  ];
  const message = new TransactionMessage({
    payerKey: new PublicKey(payer),
    recentBlockhash: bs58.encode(Uint8Array.from(build.blockhashWithMetadata.blockhash)),
    instructions,
  }).compileToV0Message(lookupTables(build.addressesByLookupTableAddress));
  return new VersionedTransaction(message);
}

export async function tokenAccountsByOwner(owner: string, mint: string): Promise<{ address: string; amountRaw: bigint }[]> {
  const res = await connection().getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
  return res.value.map((a) => ({
    address: a.pubkey.toBase58(),
    amountRaw: BigInt(a.account.data.parsed.info.tokenAmount.amount),
  }));
}
