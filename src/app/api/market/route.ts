import { marketSnapshot } from "@/lib/market";

export async function GET() {
  try {
    // Every open tab polls this; the CDN answers most of them.
    return Response.json(await marketSnapshot(), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Market data unavailable." }, { status: 503 });
  }
}
