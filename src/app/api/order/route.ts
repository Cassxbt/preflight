import { z } from "zod";
import { createFinalOrder } from "@/lib/order";

const Body = z.object({ mint: z.string(), wallet: z.string(), usdc: z.number() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, status: "ERROR", error: "Expected { mint, wallet, usdc }." }, { status: 400 });
  try {
    const result = await createFinalOrder(parsed.data.mint, parsed.data.wallet, parsed.data.usdc);
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    return Response.json({ ok: false, status: "ERROR", error: e instanceof Error ? e.message : "Order failed." }, { status: 400 });
  }
}
