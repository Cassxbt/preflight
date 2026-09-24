import { marketSnapshot } from "@/lib/market";

export async function GET() {
  try {
    return Response.json(await marketSnapshot());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Market data unavailable." }, { status: 503 });
  }
}
