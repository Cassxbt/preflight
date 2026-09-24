import type { NextRequest } from "next/server";
import { canonicalJson } from "@/lib/canonical";
import { rateLimited } from "@/lib/rateLimit";
import { buildReceipt } from "@/lib/receipt";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/receipt/[signature]">) {
  const limited = await rateLimited(request, "receipt", 60);
  if (limited) return limited;
  const { signature } = await ctx.params;
  const receipt = await buildReceipt(signature).catch((e) => {
    console.error("receipt failed", e);
    return undefined;
  });
  if (receipt === undefined) return Response.json({ error: "Receipts cannot be read right now." }, { status: 503 });
  if (!receipt) return Response.json({ error: "No receipt for this signature." }, { status: 404 });
  return new Response(canonicalJson(receipt), { headers: { "content-type": "application/json" } });
}
