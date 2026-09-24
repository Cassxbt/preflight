import { fetchCatalog } from "@/lib/catalog";
import { lifecycleEntries } from "@/lib/lifecycle";

export async function GET() {
  try {
    const catalog = await fetchCatalog();
    const lifecycle = lifecycleEntries();
    const tokens = catalog.entries.map((e) => ({
      symbol: e.symbol,
      name: e.name,
      mint: e.contract_address,
      image: e.image,
      markPrice: e.markPrice,
      tokenPrice: e.tokenPrice,
      listedPremiumPct: (e.tokenPrice / e.markPrice - 1) * 100,
      deadline: lifecycle.find((l) => l.mint === e.contract_address && l.state === "deadline_ahead")?.deadline ?? null,
    }));
    const retired = lifecycle
      .filter((l) => l.state === "window_closed")
      .map((l) => ({ symbol: l.symbol, mint: l.mint, deadline: l.deadline, issuerUrl: l.issuerUrl }));
    return Response.json({ retrievedAt: catalog.retrievedAt, tokens, retired });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Catalog unavailable." }, { status: 503 });
  }
}
