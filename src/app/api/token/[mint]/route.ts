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
    return detail ? Response.json(detail) : Response.json({ error: "Not a PreStocks catalog token." }, { status: 404 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Token data unavailable." }, { status: 503 });
  }
}
