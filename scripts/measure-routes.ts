// Read-only M1 measurement: simulates the same purchase on both Jupiter paths.
// Nothing is signed or sent. Usage: npx tsx --env-file=.env.local scripts/measure-routes.ts [usdc] [mint]
import { VersionedTransaction } from "@solana/web3.js";
import { USDC_MINT } from "../src/lib/constants";
import { metaOrder, routerBuild } from "../src/lib/jupiter";
import { assembleRouterTransaction, connection, simulate, tokenAccountsByOwner } from "../src/lib/solana";

const ANTHROPIC = "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw";

async function main() {
  const usdc = Number(process.argv[2] ?? "2");
  const mint = process.argv[3] ?? ANTHROPIC;
  const wallet = process.env.HACKATHON_WALLET!;
  const amount = BigInt(Math.round(usdc * 1e6));

  const [usdcAccts, outAccts] = await Promise.all([
    tokenAccountsByOwner(wallet, USDC_MINT),
    tokenAccountsByOwner(wallet, mint),
  ]);
  if (!usdcAccts.length || !outAccts.length) throw new Error("Expected existing USDC and output token accounts");
  const usdcAcct = usdcAccts[0];
  const outAcct = outAccts[0];
  const solBefore = await connection().getBalance(new (await import("@solana/web3.js")).PublicKey(wallet));
  const watch = [wallet, usdcAcct.address, outAcct.address];

  const report = async (label: string, tx: VersionedTransaction, quotedOut: string) => {
    const sim = await simulate(tx, watch);
    if (sim.err) {
      console.log(`${label}: SIMULATION FAILED`, JSON.stringify(sim.err));
      console.log(sim.logs.slice(-8).join("\n"));
      return null;
    }
    const [w, u, o] = sim.accounts;
    const credited = (o.tokenAmountRaw ?? 0n) - outAcct.amountRaw;
    const debited = usdcAcct.amountRaw - (u.tokenAmountRaw ?? 0n);
    const solCost = solBefore - w.lamports;
    console.log(
      `${label}: quotedOut=${quotedOut} simulatedCredit=${credited} usdcDebited=${debited} ` +
        `solCostLamportsExclSigFee=${solCost} CU=${sim.unitsConsumed} txBytes=${tx.serialize().length}`,
    );
    return { credited, debited, solCost };
  };

  const meta = await metaOrder({ inputMint: USDC_MINT, outputMint: mint, amount, taker: wallet });
  console.log(`META router=${meta.router} feeBps=${meta.feeBps} feeMint=${meta.feeMint.slice(0, 6)} slippageBps=${meta.slippageBps} prio=${meta.prioritizationFeeLamports} rent=${meta.rentFeeLamports}`);
  const metaRes = meta.transaction
    ? await report("META  ", VersionedTransaction.deserialize(Buffer.from(meta.transaction, "base64")), meta.outAmount)
    : (console.log("META: no transaction", meta.errorCode, meta.errorMessage), null);

  const slippage = Number(process.env.ROUTER_SLIPPAGE_BPS ?? "100");
  const build = await routerBuild({ inputMint: USDC_MINT, outputMint: mint, amount, taker: wallet }, slippage);
  console.log(`ROUTER route=${build.routePlan.map((r) => r.swapInfo.label).join(">")} slippageBps=${build.slippageBps}`);
  const memo = `preflight:v1:${"0".repeat(64)}`;
  const routerRes = await report("ROUTER", assembleRouterTransaction(build, wallet, memo), build.outAmount);

  if (metaRes && routerRes) {
    const diff = Number(routerRes.credited - metaRes.credited) / Number(metaRes.credited);
    console.log(`ROUTER vs META simulated credit: ${(diff * 100).toFixed(3)}%  (SOL cost ${routerRes.solCost} vs ${metaRes.solCost} lamports)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
