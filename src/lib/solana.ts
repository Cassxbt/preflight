import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { MEMO_PROGRAM_ID } from "./constants";
import { serverEnv } from "./env";
import type { ApiInstruction, RouterBuild } from "./jupiter";

const COMPUTE_UNIT_LIMIT_MAX = 1_400_000;

export function connection(): Connection {
  return new Connection(serverEnv.solanaRpcUrl(), "confirmed");
}

// Slots target 400 ms and rarely run faster than ~380 ms, so this turns remaining blocks into a
// time budget that errs short. The margin leaves room for the submit round trip and landing.
export const MIN_SECONDS_PER_BLOCK = 0.38;
export const SUBMIT_MARGIN_BLOCKS = 12;

export async function blocksUntilExpiry(lastValidBlockHeight: number): Promise<number> {
  return lastValidBlockHeight - (await connection().getBlockHeight("confirmed"));
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

export function memoInstruction(text: string): TransactionInstruction {
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

// Assembles the Router path's v0 transaction with an optional memo appended after the swap.
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

export type SimulatedAccount = { address: string; lamports: number; tokenAmountRaw: bigint | null };

export type SimulationResult = {
  err: unknown;
  unitsConsumed: number | null;
  logs: string[];
  accounts: SimulatedAccount[];
};

export async function simulate(tx: VersionedTransaction, watch: string[]): Promise<SimulationResult> {
  const res = await connection().simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: watch },
  });
  const accounts = (res.value.accounts ?? []).map((acct, i) => {
    let tokenAmountRaw: bigint | null = null;
    if (acct && acct.data && Array.isArray(acct.data)) {
      const bytes = Buffer.from(acct.data[0], "base64");
      // SPL and Token-2022 accounts share the base layout: amount is a u64 at offset 64.
      if (bytes.length >= 72) tokenAmountRaw = bytes.readBigUInt64LE(64);
    }
    return { address: watch[i], lamports: acct?.lamports ?? 0, tokenAmountRaw };
  });
  return {
    err: res.value.err,
    unitsConsumed: res.value.unitsConsumed ?? null,
    logs: res.value.logs ?? [],
    accounts,
  };
}

export async function tokenAccountsByOwner(owner: string, mint: string): Promise<{ address: string; amountRaw: bigint }[]> {
  const res = await connection().getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
  return res.value.map((a) => ({
    address: a.pubkey.toBase58(),
    amountRaw: BigInt(a.account.data.parsed.info.tokenAmount.amount),
  }));
}
