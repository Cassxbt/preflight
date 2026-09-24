import { Connection, VersionedTransaction } from "@solana/web3.js";
import { serverEnv } from "./env";

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
