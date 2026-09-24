import { z } from "zod";
import { rateLimited } from "@/lib/rateLimit";
import { submitSignedOrder } from "@/lib/submit";

// A Solana transaction is at most 1232 bytes, so its base64 fits well under 2,000 characters.
const Body = z.object({
  orderId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  signedTransaction: z.string().max(2000),
  ackedReasons: z.array(z.string().max(40)).max(20),
});

export async function POST(request: Request) {
  const limited = await rateLimited(request, "submit", 20);
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, code: "BAD_REQUEST", error: "Expected { orderId, signedTransaction, ackedReasons }." }, { status: 400 });
  try {
    const result = await submitSignedOrder(parsed.data.orderId, parsed.data.signedTransaction, parsed.data.ackedReasons);
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch {
    // submitSignedOrder handles every failure after broadcast itself, so anything thrown here happened before it.
    return Response.json({ ok: false, code: "NOT_SENT", error: "Preflight could not process this submission. Nothing was sent. Prepare a new order." }, { status: 500 });
  }
}
