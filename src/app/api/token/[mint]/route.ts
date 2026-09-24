import type { NextRequest } from "next/server";
import { parsePublicKey } from "@/lib/gather";
import { tokenDetail } from "@/lib/market";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/token/[mint]">) {
  let mint: string;
  try {
    mint = parsePublicKey((await ctx.params).mint);
  } catch {
    return Response.json({ error: "Not a valid Solana mint address." }, { status: 400 });
  }
  try {
    const detail = await tokenDetail(mint);
    if (!detail) return Response.json({ error: "Not a PreStocks catalog token." }, { status: 404 });
    const complete = detail.pool && detail.candles.length > 1;
    return Response.json(detail, { headers: { "cache-control": complete ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Token data unavailable." }, { status: 503 });
  }
}
