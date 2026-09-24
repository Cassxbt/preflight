import Link from "next/link";
import { runCheck } from "@/lib/check";
import { catalogView } from "@/lib/catalogView";
import { gatherPreview } from "@/lib/gather";
import { SiteFooter, SiteHeader } from "./_site/chrome";
import { VerdictCard } from "./_site/verdict-card";

const XAI = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const RECEIPT = "5XcWu1fa7tvQqDHuVynJ4rNbpnFBHgtTHHhz1wXnim1C3xvVfoBjVYLVKJNu8HQsgtiWrSurLPZWeUcrjwPqwXPV";

async function liveXai() {
  try {
    const { input } = await gatherPreview(XAI);
    return { checkedAt: input.now, result: runCheck(input) };
  } catch {
    return null;
  }
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{children}</p>;
}

function Section({ id, eyebrow, title, lead, children }: { id?: string; eyebrow: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-14 border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="max-w-2xl space-y-4">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
          {lead && <p className="text-lg text-muted text-pretty">{lead}</p>}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

export default async function Landing() {
  const [xai, catalog] = await Promise.all([liveXai(), catalogView().catch(() => null)]);
  const openai = catalog?.tokens.find((t) => t.symbol === "OPENAI");
  const aboveMark = catalog?.tokens.filter((t) => t.listedPremiumPct > 5) ?? [];

  const refusals = [
    {
      code: "ISSUER_WINDOW_CLOSED",
      status: "HOLD",
      title: "A token whose issuer window has closed",
      body: "XAI holders had until 12 September 2026 to swap into SPACEX. The mint still exists on chain.",
      mint: XAI,
    },
    {
      code: "MINT_PAUSED",
      status: "HOLD",
      title: "A paused, superseded mint",
      body: "The first OPENAI mint is paused under Token-2022. It still carries the name.",
      mint: "PreYKD2kJ5xGgoZ644VPfbEN7sW8bWCUREHr5S3ebV9",
    },
    {
      code: "NOT_IN_CURRENT_CATALOG",
      status: "HOLD",
      title: "A mint the issuer does not list",
      body: "Tokens can reuse a PreStocks name. Only the exact mints in the issuer's catalog pass.",
      mint: "6yWNSP6qqhob2WqjBmNb1RuVsBK17RM3SqTYAXYz8KPr",
    },
    {
      code: "ABOVE_MARK",
      status: "DISCLOSE",
      title: "A price far above the issuer's mark",
      body: openai
        ? `PreStocks lists OPENAI at $${openai.tokenPrice.toFixed(2)} against a $${openai.markPrice.toFixed(2)} mark, ${openai.listedPremiumPct.toFixed(1)}% above.`
        : "Some listed prices sit far above the issuer's own mark.",
      mint: openai?.mint ?? "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
    },
  ];

  const stack = [
    ["PreStocks catalog API", "src/lib/catalog.ts", "The exact current mints, each token's mark and listed price.", "Copies and superseded mints pass as the real token."],
    ["PreStocks issuer pages", "src/lib/issuer.ts", "Lifecycle terms, matched on the live page and against a hashed capture.", "A token past its conversion deadline looks buyable."],
    ["Token-2022 extensions", "src/lib/mintState.ts", "Transfer fee for the active epoch, scaled UI multiplier, pause state.", "The per-token price is wrong and a paused mint slips through."],
    ["Jupiter Swap V2", "src/lib/jupiter.ts", "The executable route and the exact transaction you sign, then execution.", "There is nothing to price, simulate or buy."],
    ["Solana simulation", "src/lib/gather.ts", "Dry-runs those bytes: USDC debited, tokens credited, SOL spent.", "Expected amounts are guesses, not measurements."],
  ];

  return (
    <div className="flex-1">
      <SiteHeader />

      <section className="grid-backdrop border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-20 pb-24 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-muted">
              Stocklana · PreStocks track · live on mainnet
            </span>
            <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
              Check the token
              <br />
              <span className="text-muted">before you sign.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted text-pretty">
              Preflight checks a PreStocks token against its issuer, its mint and its route, holds anything that should not be bought, and
              makes you acknowledge every warning before you sign the exact transaction it checked.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/app" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90">
                Launch app
              </Link>
              <Link href={`/r/${RECEIPT}`} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface">
                See a real receipt
              </Link>
            </div>
            <dl className="grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
              <div>
                <dt className="text-xs text-muted">Checks per order</dt>
                <dd className="mt-1 font-mono text-2xl">13</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Listed &gt;5% over mark</dt>
                <dd className="mt-1 font-mono text-2xl">{catalog ? `${aboveMark.length} of ${catalog.tokens.length}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Wallet needed to check</dt>
                <dd className="mt-1 font-mono text-2xl">No</dd>
              </div>
            </dl>
          </div>
          {xai ? (
            <VerdictCard symbol="XAI" mint={XAI} checkedAt={xai.checkedAt} result={xai.result} />
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-8 text-muted">The live check could not run just now. Open the app to try it.</div>
          )}
        </div>
      </section>

      <Section
        eyebrow="The problem"
        title="Your wallet shows a price. It does not show the issuer."
        lead="PreStocks tokens carry issuer rules a swap screen never surfaces: conversion deadlines, replaced mints, a transfer fee, and a mark that the market price can drift far from."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Deadlines", "xAI's issuer-defined window to swap XAI into SPACEX closed on 12 September 2026. SpaceX tokens must be swapped before 12 March 2027."],
            ["Lookalikes", "Superseded mints are paused, and tokens outside the catalog can reuse the name. Only the issuer's exact mint is the token."],
            [
              "Premiums",
              aboveMark.length
                ? `${aboveMark.map((t) => `${t.symbol} ${t.listedPremiumPct.toFixed(0)}%`).join(" and ")} above mark in the live catalog, before a Token-2022 transfer fee of about 1% on the tested token.`
                : "Listed prices can sit well above the issuer's mark, before a Token-2022 transfer fee.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-6">
              <p className="font-semibold">{title}</p>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="how"
        eyebrow="How it works"
        title="One gate between the quote and your signature."
        lead="Every order is checked again on the server for your wallet and amount, and the transaction you sign is the one that was checked."
      >
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
          {[
            ["Check", "Issuer lifecycle, catalog listing and mint state, with no wallet. Price, route and cost once you name an amount."],
            ["Simulate", "The exact Jupiter transaction is dry-run for your wallet: USDC out, tokens in, SOL spent, worst-case fill."],
            ["Acknowledge", "HOLD builds nothing. DISCLOSE lists each reason with its source; you tick each one on this order."],
            ["Sign and keep a receipt", "You sign those bytes within the route's validity. The receipt separates chain facts from app records."],
          ].map(([title, body], i) => (
            <li key={title} className="bg-surface p-6">
              <span className="font-mono text-xs text-muted">0{i + 1}</span>
              <p className="mt-3 font-semibold">{title}</p>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          {[
            ["HOLD", "text-hold", "Something should stop this buy. No transaction is built."],
            ["DISCLOSE", "text-disclose", "Signable after you acknowledge each warning."],
            ["CLEAR", "text-clear", "No configured warning triggered at this size and time."],
            ["NOT CHECKED", "text-muted", "Named explicitly, never shown as a pass."],
          ].map(([label, tone, body]) => (
            <div key={label} className="rounded-xl border border-line p-4">
              <p className={`font-mono text-sm font-semibold ${tone}`}>{label}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Try to make it buy"
        title="Four tokens a wallet would let you buy."
        lead="Each one opens in the app and runs live against the issuer, the chain and Jupiter. No wallet needed."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {refusals.map((r) => (
            <Link
              key={r.code}
              href={`/app?mint=${r.mint}`}
              className="group rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-foreground/30"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-xs">{r.code}</span>
                <span className={`font-mono text-xs font-semibold ${r.status === "HOLD" ? "text-hold" : "text-disclose"}`}>{r.status}</span>
              </div>
              <p className="mt-4 text-lg font-semibold">{r.title}</p>
              <p className="mt-2 text-sm text-muted">{r.body}</p>
              <p className="mt-4 text-sm text-muted group-hover:text-foreground">Run this check →</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        id="stack"
        eyebrow="Built on"
        title="Remove any of these and Preflight breaks."
        lead="Each dependency supplies a fact the check cannot get anywhere else."
      >
        <div className="overflow-hidden rounded-2xl border border-line">
          {stack.map(([name, file, gives, without]) => (
            <div key={name} className="grid gap-2 border-b border-line p-5 last:border-0 md:grid-cols-[1fr_1.4fr_1.4fr] md:gap-6">
              <div>
                <p className="font-semibold">{name}</p>
                <p className="font-mono text-xs text-muted">{file}</p>
              </div>
              <p className="text-sm text-muted">{gives}</p>
              <p className="text-sm">
                <span className="text-hold">Without it: </span>
                {without}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="proof"
        eyebrow="Proof"
        title="A real purchase on mainnet, checked first."
        lead="2 USDC into ANTHROPIC through the app on 24 September 2026. The receipt reads the chain live and publishes the verdict it signed against."
      >
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["USDC debited", "2.000000", "chain verified"],
            ["Tokens credited", "0.00189735", "chain verified"],
            ["Expected before signing", "0.00189904", "app recorded, −0.09%"],
            ["Verdict", "DISCLOSE", "HIGH_NETWORK_COST, acknowledged"],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-2 font-mono text-xl">{value}</p>
              <p className="mt-1 text-xs text-muted">{note}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/r/${RECEIPT}`} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface">
            Open the receipt
          </Link>
          <a href={`https://solscan.io/tx/${RECEIPT}`} target="_blank" rel="noreferrer" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface">
            View on Solscan
          </a>
        </div>
      </Section>

      <Section id="limits" eyebrow="Honesty" title="What Preflight proves, and what it does not.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="font-semibold text-clear">Proves</p>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>The transaction you signed is byte-for-byte the one it simulated and checked.</li>
              <li>What the chain recorded: USDC debited, tokens credited, SOL spent.</li>
              <li>That the issuer page carried the reviewed terms and linked the mint when it was checked.</li>
              <li>That the verdict record was not changed after signing: its SHA-256 is recomputable from the receipt.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="font-semibold text-disclose">Does not</p>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>Decide whether you are eligible. PreStocks says its tokens are not available to U.S. persons.</li>
              <li>Put the verdict on chain. Jupiter&apos;s aggregator transaction cannot be modified to add a memo, so the link is the receipt record.</li>
              <li>Know when the issuer last updated its mark; it shows when the mark was read.</li>
              <li>Protect trades made elsewhere. Orders are capped at 5 USDC while this is a hackathon build.</li>
            </ul>
          </div>
        </div>
      </Section>

      <section>
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 md:flex-row md:items-center md:justify-between">
          <h2 className="text-3xl font-semibold tracking-tight">Check a PreStocks token now.</h2>
          <Link href="/app" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90">
            Launch app
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
