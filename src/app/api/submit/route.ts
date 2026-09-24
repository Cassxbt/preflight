import { z } from "zod";
import { submitSignedOrder } from "@/lib/submit";

const Body = z.object({ orderId: z.string(), signedTransaction: z.string(), ackedReasons: z.array(z.string()) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, code: "BAD_REQUEST", error: "Expected { orderId, signedTransaction, ackedReasons }." }, { status: 400 });
  const result = await submitSignedOrder(parsed.data.orderId, parsed.data.signedTransaction, parsed.data.ackedReasons);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
