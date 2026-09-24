import type { NextRequest } from "next/server";
import { runCheck } from "@/lib/check";
import { gatherPreview, parsePublicKey } from "@/lib/gather";
import { rateLimited } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const limited = await rateLimited(request, "check", 60);
  if (limited) return limited;
  const mintParam = request.nextUrl.searchParams.get("mint") ?? "";
  let mint: string;
  try {
    mint = parsePublicKey(mintParam);
  } catch {
    return Response.json({ error: "Not a valid Solana mint address." }, { status: 400 });
  }
  const { input, symbol } = await gatherPreview(mint);
  const check = runCheck(input);
  return Response.json({ mint, symbol: symbol ?? input.retired?.symbol ?? null, checkedAt: input.now, ...check, preview: true });
}
