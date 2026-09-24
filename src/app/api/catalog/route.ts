import { catalogView } from "@/lib/catalogView";

export async function GET() {
  try {
    return Response.json(await catalogView());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Catalog unavailable." }, { status: 503 });
  }
}
