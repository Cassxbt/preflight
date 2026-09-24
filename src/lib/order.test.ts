import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { createFinalOrder, InvalidOrderInput } from "./order";

const MINT = "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw";
const WALLET = Keypair.generate().publicKey.toBase58();
const PDA = PublicKey.findProgramAddressSync([Buffer.from("preflight")], new PublicKey(MINT))[0].toBase58();

describe("createFinalOrder input", () => {
  it.each([
    ["a mint that is not an address", "x", WALLET, 1, "Mint is not a valid Solana address"],
    ["a wallet that is not an address", MINT, "x", 1, "Wallet is not a valid Solana address"],
    ["a program-derived wallet", MINT, PDA, 1, "signing address"],
    ["an amount below the minimum", MINT, WALLET, 0.001, "at least"],
    ["an amount above the cap", MINT, WALLET, 5.01, "per-order limit"],
    ["a non-finite amount", MINT, WALLET, Number.NaN, "at least"],
  ])("rejects %s as the caller's error before any network call", async (_, mint, wallet, usdc, message) => {
    const attempt = createFinalOrder(mint, wallet, usdc);
    await expect(attempt).rejects.toBeInstanceOf(InvalidOrderInput);
    await expect(attempt).rejects.toThrow(message);
  });
});
