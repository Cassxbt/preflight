import { catalogView } from "@/lib/catalogView";
import Checker from "./checker";

const STEPS = [
  ["Check", "Issuer lifecycle, current catalog, mint state, and the price you'd pay against the issuer's mark."],
  ["Acknowledge", "Every warning is listed with its source. Anything that should stop a buy is held, with no transaction built."],
  ["Sign and keep a receipt", "You sign the exact transaction that was checked. The receipt separates what the chain proves from what the app recorded."],
];

export default async function Home() {
  const catalog = await catalogView().catch(() => null);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Preflight</h1>
        <p className="text-lg opacity-80">
          A pre-trade check for PreStocks tokens on Solana. xAI&apos;s issuer conversion window closed on 12 September, paused mints and
          unlisted copies still exist, and some tokens trade far above their issuer mark. Preflight checks all of that before you sign.
        </p>
        <ol className="grid gap-3 pt-2 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded border border-current/15 p-3 text-sm">
              <span className="font-mono text-xs opacity-50">{i + 1}</span>
              <p className="font-semibold">{title}</p>
              <p className="opacity-70">{body}</p>
            </li>
          ))}
        </ol>
      </header>
      <Checker catalog={catalog} />
    </main>
  );
}
