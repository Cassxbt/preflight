import type { NextRequest } from "next/server";
import { parsePublicKey } from "@/lib/gather";
import { CHART_RANGES, marketSnapshot, tokenChart, type ChartRange } from "@/lib/market";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/token/[mint]/chart">) {
  const range = request.nextUrl.searchParams.get("range") ?? "1W";
  if (!(range in CHART_RANGES)) return Response.json({ error: "range must be 1D, 1W or 1M." }, { status: 400 });
  let mint: string;
  try {
    mint = parsePublicKey((await ctx.params).mint);
  } catch {
    return Response.json({ error: "Not a valid Solana mint address." }, { status: 400 });
  }
  const pool = (await marketSnapshot().catch(() => null))?.quotes.find((q) => q.mint === mint)?.topPool;
  if (!pool) return Response.json({ error: "No market for this mint." }, { status: 404 });
  const candles = await tokenChart(mint, pool, range as ChartRange);
  return candles ? Response.json({ range, candles }) : Response.json({ error: "Price history unavailable right now." }, { status: 503 });
}
