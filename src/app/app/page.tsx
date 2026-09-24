import type { Metadata } from "next";
import { catalogView } from "@/lib/catalogView";
import { parsePublicKey } from "@/lib/gather";
import Checker from "../checker";
import { SiteFooter, SiteHeader } from "../_site/chrome";

export const metadata: Metadata = { title: "Preflight app" };

function validMint(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return parsePublicKey(value);
  } catch {
    return undefined;
  }
}

export default async function App(props: PageProps<"/app">) {
  const [catalog, params] = await Promise.all([catalogView().catch(() => null), props.searchParams]);
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader links={false} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Check a PreStocks token</h1>
          <p className="text-muted">Pick a listed token or paste any mint. Checking needs no wallet; buying re-checks everything for your wallet and amount.</p>
        </header>
        <Checker catalog={catalog} initialMint={validMint(params.mint)} />
      </main>
      <SiteFooter />
    </div>
  );
}
