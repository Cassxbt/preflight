import { PublicKey } from "@solana/web3.js";
import { connection } from "./solana";

export type MintState = {
  program: string;
  decimals: number;
  paused: boolean | null;
  transferFee: { bps: number; maxFeeRaw: bigint; epoch: number } | null;
  multiplier: number;
  currentEpoch: number;
};

type ParsedExtension = { extension: string; state: Record<string, unknown> };
type FeeSide = { epoch: number; maximumFee: number | string; transferFeeBasisPoints: number };

// Token-2022 applies the newer fee schedule only once its epoch is reached.
export function activeFee(state: Record<string, unknown>, currentEpoch: number) {
  const newer = state.newerTransferFee as FeeSide;
  const older = state.olderTransferFee as FeeSide;
  const side = currentEpoch >= Number(newer.epoch) ? newer : older;
  return { bps: Number(side.transferFeeBasisPoints), maxFeeRaw: BigInt(side.maximumFee), epoch: Number(side.epoch) };
}

// ScaledUiAmount: the new multiplier applies once its effective timestamp has passed.
export function effectiveMultiplier(state: Record<string, unknown>, nowSec: number): number {
  const ts = Number(state.newMultiplierEffectiveTimestamp ?? 0);
  return ts > 0 && nowSec >= ts ? Number(state.newMultiplier) : Number(state.multiplier);
}

export async function readMintState(mint: string): Promise<MintState> {
  const conn = connection();
  const [info, epochInfo] = await Promise.all([
    conn.getParsedAccountInfo(new PublicKey(mint)),
    conn.getEpochInfo(),
  ]);
  const value = info.value;
  if (!value) throw new Error(`Mint ${mint} not found on chain`);
  const data = value.data as { parsed?: { info: { decimals: number; extensions?: ParsedExtension[] } } };
  if (!data.parsed) throw new Error(`Mint ${mint} is not a parsable token mint`);

  const extensions = data.parsed.info.extensions ?? [];
  const byName = (name: string) => extensions.find((e) => e.extension === name)?.state;
  const nowSec = Math.floor(Date.now() / 1000);

  const pausable = byName("pausableConfig");
  const fee = byName("transferFeeConfig");
  const scaled = byName("scaledUiAmountConfig");

  return {
    program: value.owner.toBase58(),
    decimals: data.parsed.info.decimals,
    paused: pausable ? Boolean(pausable.paused) : null,
    transferFee: fee ? activeFee(fee, epochInfo.epoch) : null,
    multiplier: scaled ? effectiveMultiplier(scaled, nowSec) : 1,
    currentEpoch: epochInfo.epoch,
  };
}
