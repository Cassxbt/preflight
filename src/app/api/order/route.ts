import { z } from "zod";
import { createFinalOrder, InvalidOrderInput } from "@/lib/order";
import { rateLimited } from "@/lib/rateLimit";

const Body = z.object({ mint: z.string(), wallet: z.string(), usdc: z.number() });

export async function POST(request: Request) {
  const limited = await rateLimited(request, "order", 10);
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, status: "ERROR", error: "Expected { mint, wallet, usdc }." }, { status: 400 });
  try {
    const result = await createFinalOrder(parsed.data.mint, parsed.data.wallet, parsed.data.usdc);
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    if (e instanceof InvalidOrderInput) return Response.json({ ok: false, status: "ERROR", error: e.message }, { status: 400 });
    console.error("order failed", e);
    return Response.json({ ok: false, status: "ERROR", error: "Preflight could not prepare this order right now. Nothing was signed." }, { status: 500 });
  }
}
