import { PublicKey } from "@solana/web3.js";
import { connection } from "./solana";

export type MintState = {
  program: string;
  decimals: number;
  paused: boolean | null;
  transferFee: { bps: number; maxFeeRaw: bigint; epoch: number } | null;
  multiplier: number;
  multiplierSchedule: MultiplierSchedule;
  currentEpoch: number;
};

const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];

type ParsedExtension = { extension: string; state: Record<string, unknown> };
type FeeSide = { epoch: number; maximumFee: number | string; transferFeeBasisPoints: number };

// Token-2022 applies the newer fee schedule only once its epoch is reached.
export function activeFee(state: Record<string, unknown>, currentEpoch: number) {
  const newer = state.newerTransferFee as FeeSide;
  const older = state.olderTransferFee as FeeSide;
  const side = currentEpoch >= Number(newer.epoch) ? newer : older;
  return { bps: Number(side.transferFeeBasisPoints), maxFeeRaw: BigInt(side.maximumFee), epoch: Number(side.epoch) };
}

export type MultiplierSchedule = { multiplier: number; newMultiplier: number; effectiveAt: number };

export function scheduledMultiplier(schedule: MultiplierSchedule, nowSec: number): number {
  return schedule.effectiveAt > 0 && nowSec >= schedule.effectiveAt ? schedule.newMultiplier : schedule.multiplier;
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
  const data = value.data as { parsed?: { type?: string; info: { decimals: number; extensions?: ParsedExtension[] } } };
  const owner = value.owner.toBase58();
  if (!data.parsed || data.parsed.type !== "mint" || !TOKEN_PROGRAMS.includes(owner)) throw new Error(`${mint} is not a token mint`);

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
    multiplierSchedule: scaled
      ? { multiplier: Number(scaled.multiplier), newMultiplier: Number(scaled.newMultiplier), effectiveAt: Number(scaled.newMultiplierEffectiveTimestamp ?? 0) }
      : { multiplier: 1, newMultiplier: 1, effectiveAt: 0 },
    currentEpoch: epochInfo.epoch,
  };
}
