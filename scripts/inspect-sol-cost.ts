// Read-only: finds which accounts a Meta-Aggregator order would fund, and whether that SOL is rent.
// Usage: npx tsx --env-file=.env.local scripts/inspect-sol-cost.ts [usdc] [tries]
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { USDC_MINT } from "../src/lib/constants";
import { metaOrder } from "../src/lib/jupiter";
import { connection, simulate } from "../src/lib/solana";

const ANTHROPIC = "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw";

async function main() {
  const usdc = Number(process.argv[2] ?? "2");
  const tries = Number(process.argv[3] ?? "4");
  const wallet = process.env.HACKATHON_WALLET!;
  const conn = connection();

  for (let i = 0; i < tries; i++) {
    const order = await metaOrder({ inputMint: USDC_MINT, outputMint: ANTHROPIC, amount: BigInt(usdc * 1e6), taker: wallet });
    if (!order.transaction) {
      console.log(`try ${i}: no tx`, order.errorCode, order.errorMessage);
      continue;
    }
    const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
    const writable = tx.message.staticAccountKeys.filter((_, idx) => tx.message.isAccountWritable(idx)).map((k) => k.toBase58());
    const pre = await conn.getMultipleAccountsInfo(writable.map((a) => new PublicKey(a)));
    const sim = await simulate(tx, writable);
    const created = writable
      .map((addr, idx) => ({ addr, before: pre[idx]?.lamports ?? 0, after: sim.accounts[idx].lamports, existed: !!pre[idx] }))
      .filter((a) => !a.existed && a.after > 0);
    const walletIdx = writable.indexOf(wallet);
    const walletCost = (pre[walletIdx]?.lamports ?? 0) - sim.accounts[walletIdx].lamports;
    console.log(
      `try ${i}: router=${order.router} out=${order.outAmount} prio=${order.prioritizationFeeLamports} rent=${order.rentFeeLamports} ` +
        `walletSolCost=${walletCost} err=${JSON.stringify(sim.err)} newAccounts=${created.length}`,
    );
    for (const c of created) {
      const owner = sim.accounts[writable.indexOf(c.addr)];
      console.log(`    new account ${c.addr} funded ${c.after} lamports`, owner ? "" : "");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
