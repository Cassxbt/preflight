import type { Metadata } from "next";
import { catalogView } from "@/lib/catalogView";
import { parsePublicKey } from "@/lib/gather";
import Checker from "../checker";
import { SiteFooter, SiteHeader } from "../_site/chrome";
import { Eyebrow } from "../_site/primitives";
import { WalletButton } from "../wallet-button";

export const metadata: Metadata = { title: "Preflight · check and buy PreStocks" };

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
    <div className="relative flex flex-1 flex-col overflow-x-clip pt-4">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[600px]">
        <div className="grid-backdrop absolute inset-0 opacity-60" />
      </div>
      <SiteHeader links={false} action={<WalletButton />} />
      <main className="relative mx-auto w-full max-w-6xl flex-1 space-y-10 px-4 pt-16 pb-24">
        <header className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-4">
            <Eyebrow>
              <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-clear align-middle" />
              PreStocks on Solana · live
            </Eyebrow>
            <h1 className="font-display text-6xl leading-[0.95] tracking-[-0.02em] sm:text-7xl">
              Check before you <em className="text-muted">sign.</em>
            </h1>
            <p className="max-w-md text-[15px] leading-relaxed text-muted">
              Pick a token to see its live market and the issuer&apos;s rules. Every buy passes the gate first.
            </p>
          </div>
          {catalog && (
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.06] md:flex">
              {[
                ["Listed tokens", String(catalog.tokens.length)],
                ["Above mark", String(catalog.tokens.filter((t) => t.listedPremiumPct > 5).length)],
                ["Prices refresh", "15s"],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface px-5 py-3">
                  <dd className="tabular font-mono text-xl">{value}</dd>
                  <dt className="mt-0.5 text-[11px] text-muted">{label}</dt>
                </div>
              ))}
            </dl>
          )}
        </header>
        <Checker catalog={catalog} initialMint={validMint(params.mint)} />
      </main>
      <SiteFooter />
    </div>
  );
}
