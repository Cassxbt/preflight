import { fetchCatalog, findExact } from "../src/lib/catalog";
import { readMintState } from "../src/lib/mintState";
import { metaOrder } from "../src/lib/jupiter";
import { USDC_MINT } from "../src/lib/constants";

// Read-only: compares our per-token price math against the issuer's own catalog fields.
const cat = await fetchCatalog();
for (const mint of ["Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw", "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh"]) {
  const e = findExact(cat, mint)!;
  const s = await readMintState(mint);
  const q = await metaOrder({ inputMint: USDC_MINT, outputMint: mint, amount: 1_000_000n });
  const rawPerUsd = Number(q.outAmount);
  const uiScaled = (rawPerUsd / 10 ** s.decimals) * s.multiplier;
  const uiUnscaled = rawPerUsd / 10 ** s.decimals;
  console.log(e.symbol, { markPrice: e.markPrice, tokenPrice: e.tokenPrice, decimals: s.decimals, multiplier: s.multiplier, pricePerScaledToken: 1 / uiScaled, pricePerRawUnitToken: 1 / uiUnscaled });
  await new Promise((r) => setTimeout(r, 1200));
}
