import { fetchCatalog } from "./catalog";
import { lifecycleEntries } from "./lifecycle";

export async function catalogView() {
  const catalog = await fetchCatalog();
  const lifecycle = lifecycleEntries();
  return {
    retrievedAt: catalog.retrievedAt,
    tokens: catalog.entries.map((e) => ({
      symbol: e.symbol,
      name: e.name,
      mint: e.contract_address,
      image: e.image,
      markPrice: e.markPrice,
      tokenPrice: e.tokenPrice,
      listedPremiumPct: (e.tokenPrice / e.markPrice - 1) * 100,
      deadline: lifecycle.find((l) => l.mint === e.contract_address && l.state === "deadline_ahead")?.deadline ?? null,
    })),
    retired: lifecycle.filter((l) => l.state === "window_closed").map((l) => ({ symbol: l.symbol, mint: l.mint, deadline: l.deadline })),
  };
}
