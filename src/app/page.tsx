import Image from "next/image";
import Link from "next/link";
import { runCheck } from "@/lib/check";
import { catalogView } from "@/lib/catalogView";
import { fmtUsd } from "@/lib/format";
import { gatherPreview } from "@/lib/gather";
import { buildReceipt } from "@/lib/receipt";
import { SiteFooter, SiteHeader } from "./_site/chrome";
import { Bezel, Cta, Eyebrow } from "./_site/primitives";
import { Reveal } from "./_site/reveal";
import { StatusLight, VerdictCard } from "./_site/verdict-card";
import { Architecture, DeadlineTimeline, LogoMarquee, MiniVerdict, PremiumChart, ReceiptTicket, SwapComparison } from "./_site/visuals";

const XAI = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const XAI_LOGO = "https://www.prestocks.com/logos/xai.png";
const RECEIPT = "3mgVKNBXReMXYzqAgwDcG2rTscGPct6o5cwCERb9jzj7p7BHmoWMvzxgaNMoWkN6LcT5RJ9UqcCfqvGUHvVSDprT";

async function liveXai() {
  try {
    const { input } = await gatherPreview(XAI);
    return { checkedAt: input.now, result: runCheck(input) };
  } catch {
    return null;
  }
}

function Heading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <Reveal className="max-w-2xl space-y-5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display text-5xl leading-[1.02] tracking-[-0.015em] text-balance sm:text-6xl">{title}</h2>
      {lead && <p className="max-w-[60ch] text-lg leading-relaxed text-muted text-pretty">{lead}</p>}
    </Reveal>
  );
}

// One live render a minute serves every visitor; the card shows when that check ran.
export const dynamic = "force-static";
export const revalidate = 60;

export default async function Landing() {
  const [xai, catalog, receipt] = await Promise.all([liveXai(), catalogView().catch(() => null), buildReceipt(RECEIPT).catch(() => null)]);
  const tokens = catalog?.tokens ?? [];
  const openai = tokens.find((t) => t.symbol === "OPENAI");
  const anthropic = tokens.find((t) => t.symbol === "ANTHROPIC");
  const lifecycle = xai?.result.reasons.find((r) => r.code === "ISSUER_WINDOW_CLOSED");
  const statement = typeof lifecycle?.evidence?.statement === "string" ? (lifecycle.evidence.statement as string) : null;

  const refusals = [
    {
      code: "ISSUER_WINDOW_CLOSED",
      status: "HOLD",
      title: "A closed conversion window",
      body: "XAI holders had until 12 September 2026 to swap into SPACEX. The mint still exists on chain.",
      mint: XAI,
      logo: XAI_LOGO as string | undefined,
    },
    {
      code: "MINT_PAUSED",
      status: "HOLD",
      title: "A paused, superseded mint",
      body: "The first OPENAI mint is paused under Token-2022, and still carries the name.",
      mint: "PreYKD2kJ5xGgoZ644VPfbEN7sW8bWCUREHr5S3ebV9",
      logo: openai?.image,
    },
    {
      code: "NOT_IN_CURRENT_CATALOG",
      status: "HOLD",
      title: "A mint the issuer does not list",
      body: "Only the exact mints in the PreStocks catalog pass. Anything else holds, whatever it calls itself.",
      mint: "6yWNSP6qqhob2WqjBmNb1RuVsBK17RM3SqTYAXYz8KPr",
      logo: undefined,
    },
    {
      code: "ABOVE_MARK",
      status: "DISCLOSE",
      title: "A price far above the mark",
      body: openai
        ? `PreStocks lists OPENAI at ${fmtUsd(openai.tokenPrice)} against its own ${fmtUsd(openai.markPrice)} mark, ${openai.listedPremiumPct.toFixed(1)}% above.`
        : "Some listed prices sit far above the issuer's own mark.",
      mint: openai?.mint ?? "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
      logo: openai?.image,
    },
  ];

  return (
    <div className="relative flex-1 overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px]">
        <div className="grid-backdrop absolute inset-0" />
        <div className="absolute top-[-200px] left-[8%] h-[520px] w-[520px] rounded-full bg-hold/[0.07] blur-[120px]" />
        <div className="absolute top-[-120px] left-[42%] h-[480px] w-[480px] rounded-full bg-disclose/[0.06] blur-[120px]" />
        <div className="absolute top-[-160px] right-[4%] h-[520px] w-[520px] rounded-full bg-clear/[0.06] blur-[120px]" />
      </div>

      <div className="relative pt-4">
        <SiteHeader />

        <section className="mx-auto grid max-w-6xl items-center gap-20 px-4 pt-20 pb-24 lg:grid-cols-[1.05fr_1fr] lg:pt-28">
          <div className="animate-fade-up space-y-9">
            <Eyebrow>PreStocks · Solana mainnet</Eyebrow>
            <h1 className="font-display text-[4rem] leading-[0.92] tracking-[-0.02em] text-balance sm:text-[5.5rem]">
              Check the token <em className="bg-gradient-to-b from-foreground to-foreground/45 bg-clip-text pr-1 text-transparent">before you sign.</em>
            </h1>
            <p className="max-w-[52ch] text-lg leading-relaxed text-muted text-pretty">
              Preflight checks a PreStocks token against its issuer, its mint and its route. It holds a buy the catalog, the mint, the route or a reviewed
              issuer deadline rules out, and you acknowledge every warning before signing the exact transaction it checked.
            </p>
            <div className="flex flex-wrap gap-3">
              <Cta href="/app">Launch app</Cta>
              <Cta href={`/r/${RECEIPT}`} variant="quiet">
                See a real receipt
              </Cta>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-clear shadow-[0_0_8px_var(--clear)]" />
              No wallet needed to check a token.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:150ms] lg:max-w-none">
            {openai && (
              <div className="absolute -top-20 -right-10 hidden w-[68%] rotate-[4deg] brightness-75 saturate-50 md:block">
                <MiniVerdict symbol="OPENAI" logo={openai.image} status="DISCLOSE" code="ABOVE_MARK" line={`Listed ${openai.listedPremiumPct.toFixed(1)}% above the issuer mark`} />
              </div>
            )}
            {anthropic && (
              <div className="absolute -bottom-20 -left-10 hidden w-[62%] -rotate-[3deg] brightness-75 saturate-50 md:block">
                <MiniVerdict symbol="ANTHROPIC" logo={anthropic.image} status="PREVIEW" code="NO WARNING" line="Listed, unpaused, within 5% of mark" />
              </div>
            )}
            <div className="relative">
              {xai ? (
                <VerdictCard symbol="XAI" mint={XAI} checkedAt={xai.checkedAt} result={xai.result} logo={XAI_LOGO} />
              ) : (
                <Bezel inner="p-8 text-muted">The live check could not run just now. Open the app to try it.</Bezel>
              )}
            </div>
          </div>
        </section>

        {tokens.length > 0 && (
          <div className="border-y border-white/[0.06] py-6">
            <div className="mx-auto max-w-6xl px-4">
              <LogoMarquee tokens={tokens} />
            </div>
          </div>
        )}

        <section className="mx-auto max-w-6xl space-y-14 px-4 py-16 md:py-24">
          <Heading
            eyebrow="The problem"
            title="Your wallet shows a price. It does not show the issuer."
            lead="PreStocks tokens carry issuer rules a swap screen never surfaces: conversion deadlines, superseded mints, a transfer fee, and a mark the market price can drift far from."
          />
          <Reveal>{xai && <SwapComparison reasons={xai.result.reasons} statement={statement} />}</Reveal>

          <div className="grid items-stretch gap-4 lg:grid-cols-12">
            <Reveal className="h-full lg:col-span-7">
              <Bezel className="h-full" inner="p-7">
                <p className="font-semibold tracking-tight">Premiums the swap screen will not flag</p>
                <p className="mt-1 max-w-[52ch] text-sm text-muted">
                  Listed price against the issuer&apos;s own mark, for every token PreStocks lists, before a Token-2022 transfer fee of about 1% on the
                  tested token.
                </p>
                <div className="mt-7">{catalog && <PremiumChart tokens={tokens} retrievedAt={catalog.retrievedAt} />}</div>
              </Bezel>
            </Reveal>
            <div className="grid gap-4 lg:col-span-5">
              <Reveal delay={100}>
                <Bezel inner="p-7">
                  <p className="font-semibold tracking-tight">Deadlines set by the issuer</p>
                  <p className="mt-1 text-sm text-muted">XAI&apos;s window to swap into SPACEX has closed. SpaceX tokens must be swapped before 12 March 2027.</p>
                  <div className="mt-8">
                    <DeadlineTimeline now={xai?.checkedAt ?? catalog?.retrievedAt ?? "2026-09-24T00:00:00Z"} />
                  </div>
                </Bezel>
              </Reveal>
              <Reveal delay={200}>
                <Bezel inner="p-7">
                  <p className="font-semibold tracking-tight">Mints that only look right</p>
                  <p className="mt-1 text-sm text-muted">Superseded mints are paused, and tokens outside the catalog can reuse a name.</p>
                  <div className="mt-5 space-y-2 font-mono text-[11px]">
                    <p className="flex justify-between rounded-lg bg-raised px-3 py-2 ring-1 ring-white/[0.05]">
                      <span>OPENAI · PreweJ…</span>
                      <span className="text-clear">listed</span>
                    </p>
                    <p className="flex justify-between rounded-lg bg-raised px-3 py-2 text-muted ring-1 ring-white/[0.05]">
                      <span className="line-through">OPENAI · PreYKD…</span>
                      <span className="text-hold">paused</span>
                    </p>
                  </div>
                </Bezel>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl space-y-14 px-4 py-16 md:py-24">
            <Heading
              eyebrow="How it works"
              title="One gate between the quote and your signature."
              lead="Every order is checked again on the server for your wallet and amount, and the transaction you sign is byte-for-byte the one that was checked."
            />
            <div className="relative grid gap-8 md:grid-cols-4 md:gap-4">
              <div aria-hidden className="absolute top-9 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-white/5 via-white/20 to-white/5 md:block" />
              {[
                ["Check", "Issuer lifecycle, catalog and mint state with no wallet. Price, route and cost once you name an amount."],
                ["Simulate", "The exact Jupiter transaction is dry-run for your wallet: USDC out, tokens in, SOL spent, worst fill."],
                ["Acknowledge", "HOLD builds nothing. DISCLOSE lists each reason with its source; you tick each one on this order."],
                ["Sign, then receipt", "You sign those bytes inside the route's validity. The receipt separates chain facts from app records."],
              ].map(([title, body], i) => (
                <Reveal key={title} delay={i * 100}>
                  <div className="relative flex gap-4 md:block md:space-y-4">
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface font-mono text-xs ring-1 ring-white/10 md:h-[4.5rem] md:w-[4.5rem] md:rounded-[1.4rem] md:text-sm">
                      0{i + 1}
                    </span>
                    <div className="space-y-2 md:space-y-4">
                      <p className="text-lg font-semibold tracking-tight">{title}</p>
                      <p className="text-sm leading-relaxed text-muted">{body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <div className="grid gap-px overflow-hidden rounded-[1.5rem] bg-white/[0.06] ring-1 ring-white/[0.06] sm:grid-cols-4">
                {[
                  ["HOLD", "text-hold", "Something should stop this buy. No transaction is built."],
                  ["DISCLOSE", "text-disclose", "Signable only after you acknowledge each warning."],
                  ["CLEAR", "text-clear", "No configured warning triggered at this size and time."],
                  ["NOT CHECKED", "text-muted", "Named explicitly. Never shown as a pass."],
                ].map(([label, tone, body]) => (
                  <div key={label} className="bg-background p-6">
                    <p className={`font-mono text-xs font-semibold tracking-wider ${tone}`}>{label}</p>
                    <p className="mt-2 text-sm text-muted">{body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl space-y-14 px-4 py-16 md:py-24">
            <Heading
              eyebrow="Try to make it buy"
              title="Four tokens Preflight stops or flags."
              lead="Each opens in the app and runs live against the issuer, the chain and Jupiter. No wallet needed."
            />
            <div className="grid gap-4 md:grid-cols-2">
              {refusals.map((r, i) => (
                <Reveal key={r.code} delay={i * 80} className="h-full">
                  <Link href={`/app?mint=${r.mint}`} className="group block h-full transition-transform duration-700 ease-spring hover:-translate-y-1">
                    <Bezel className="h-full" inner="flex h-full flex-col p-7">
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2.5">
                          {r.logo ? (
                            <Image src={r.logo} alt="" width={28} height={28} className="rounded-full ring-1 ring-white/10" />
                          ) : (
                            <span className="h-7 w-7 rounded-full border border-dashed border-hold/50" />
                          )}
                          <span className="font-mono text-[11px] text-muted">
                            {r.mint.slice(0, 4)}…{r.mint.slice(-4)}
                          </span>
                        </span>
                        <StatusLight status={r.status} />
                      </div>
                      <p className="mt-6 text-xl font-semibold tracking-tight">{r.title}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
                      <p className="mt-6 rounded-xl bg-raised px-3 py-2 font-mono text-[11px] ring-1 ring-white/[0.05]">{r.code}</p>
                      <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm text-muted transition-colors duration-500 group-hover:text-foreground">
                        Run this check
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-500 ease-spring group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                          <path d="M3 8h10M9 4l4 4-4 4" />
                        </svg>
                      </span>
                    </Bezel>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="stack" className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl space-y-14 px-4 py-16 md:py-24">
            <Heading eyebrow="Built on" title="Remove any layer and Preflight breaks." lead="Each dependency supplies a fact the gate cannot get anywhere else." />
            <Reveal>
              <Architecture />
            </Reveal>
          </div>
        </section>

        <section id="proof" className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 py-16 md:py-24 lg:grid-cols-2">
            <div className="space-y-8">
              <Heading
                eyebrow="Proof"
                title="A real purchase on mainnet, checked first."
                lead="1 USDC into SPACEX through this app on 24 September 2026, after acknowledging the issuer's own deadline. The receipt reads the on-chain balance changes and publishes the verdict it was signed against."
              />
              <Reveal className="flex flex-wrap gap-3">
                <Cta href={`/r/${RECEIPT}`}>Open the receipt</Cta>
                <Cta href={`https://solscan.io/tx/${RECEIPT}`} variant="quiet">
                  View on Solscan
                </Cta>
              </Reveal>
            </div>
            <Reveal delay={150}>{receipt && <ReceiptTicket receipt={receipt} />}</Reveal>
          </div>
        </section>

        <section id="limits" className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl space-y-14 px-4 py-16 md:py-24">
            <Heading eyebrow="Honesty" title="What Preflight proves, and what it does not." />
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  label: "What it enforces",
                  dot: "bg-clear",
                  tone: "text-clear",
                  items: [
                    "Refuses to send any signed transaction whose bytes differ from the one it simulated and checked.",
                    "Reads every receipt from the chain: USDC debited, tokens credited, SOL spent. Anyone can reproduce these from the signature.",
                    "Records whether the issuer page linked the mint and carried the reviewed terms at check time, next to the capture's SHA-256.",
                    "Publishes the verdict and its SHA-256 on each receipt, so a copy saved at signing can be compared later.",
                  ],
                },
                {
                  label: "Does not",
                  dot: "bg-disclose",
                  tone: "text-disclose",
                  items: [
                    "Decide your eligibility. PreStocks says its tokens are not available to U.S. persons.",
                    "Anchor the verdict on chain. Preflight submits Jupiter's prepared transaction unchanged and rejects any edit to it, so the verdict record is stored by Preflight, not in the transaction.",
                    "Know when the issuer last updated its mark. It shows when the mark was read.",
                    "Protect trades made elsewhere. Orders are capped at 5 USDC while this is a hackathon build.",
                  ],
                },
              ].map((col, i) => (
                <Reveal key={col.label} delay={i * 100} className="h-full">
                  <Bezel className="h-full" inner="p-8">
                    <p className={`font-mono text-xs font-semibold tracking-wider uppercase ${col.tone}`}>{col.label}</p>
                    <ul className="mt-6 space-y-4">
                      {col.items.map((item) => (
                        <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted">
                          <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${col.dot}`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </Bezel>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/[0.06]">
          <div aria-hidden className="absolute top-1/2 left-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.04] blur-[100px]" />
          <Reveal className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-36 text-center">
            <h2 className="max-w-3xl font-display text-5xl leading-[1.02] tracking-[-0.015em] text-balance sm:text-7xl">
              Check a PreStocks token before your <em className="text-muted">next buy.</em>
            </h2>
            <Cta href="/app">Launch app</Cta>
          </Reveal>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
