import type { NextRequest } from "next/server";
import { canonicalJson } from "@/lib/canonical";
import { buildReceipt } from "@/lib/receipt";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/receipt/[signature]">) {
  const { signature } = await ctx.params;
  const receipt = await buildReceipt(signature);
  if (!receipt) return Response.json({ error: "No receipt for this signature." }, { status: 404 });
  return new Response(canonicalJson(receipt), { headers: { "content-type": "application/json" } });
}
