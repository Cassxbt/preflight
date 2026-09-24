import { SiteFooter, SiteHeader } from "../../_site/chrome";
import { Cta, Eyebrow } from "../../_site/primitives";

export default function ReceiptNotFound() {
  return (
    <div className="relative flex flex-1 flex-col pt-4">
      <SiteHeader links={false} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 pt-24 pb-24">
        <Eyebrow>Preflight receipt</Eyebrow>
        <h1 className="font-display text-6xl leading-[0.95] tracking-[-0.02em]">
          No receipt <em className="text-muted">for this signature.</em>
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-muted">
          Preflight only keeps receipts for purchases made through it. Check the signature, or look the transaction up on a Solana explorer.
        </p>
        <Cta href="/app">Open the app</Cta>
      </main>
      <SiteFooter />
    </div>
  );
}
