import Image from "next/image";
import type { Reason } from "@/lib/check";
import { fmtDate, fmtSol, fmtTokens, tokensUi } from "@/lib/format";
import type { Receipt } from "@/lib/receipt";
import { Bezel } from "./primitives";
import { StatusLight, TONE } from "./verdict-card";

type Token = { symbol: string; mint: string; image?: string; markPrice: number; tokenPrice: number; listedPremiumPct: number };

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export function MiniVerdict({ symbol, logo, status, code, line }: { symbol: string; logo?: string; status: string; code: string; line: string }) {
  return (
    <Bezel solid>
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {logo && <Image src={logo} alt={`${symbol} logo`} width={28} height={28} className="rounded-full ring-1 ring-white/10" />}
            <span className="font-semibold tracking-tight">{symbol}</span>
          </div>
          <StatusLight status={status} />
        </div>
        <div className="rounded-xl bg-raised px-3 py-2.5 ring-1 ring-white/[0.05]">
          <p className="font-mono text-[11px]">{code}</p>
          <p className="mt-1 text-[12px] text-muted">{line}</p>
        </div>
      </div>
    </Bezel>
  );
}

export function LogoMarquee({ tokens }: { tokens: Token[] }) {
  const row = [...tokens, ...tokens];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-10 py-2">
        {row.map((t, i) => (
          <div key={`${t.mint}-${i}`} className="flex items-center gap-2.5 text-sm text-muted">
            {t.image && <Image src={t.image} alt="" width={22} height={22} className="rounded-full opacity-80 grayscale-[35%]" />}
            <span className="font-medium tracking-tight">{t.symbol}</span>
            <span className={`tabular font-mono text-xs ${t.listedPremiumPct > 5 ? "text-disclose" : ""}`}>{pct(t.listedPremiumPct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Listed price against the issuer's own mark for every token, with the 5% policy line.
export function PremiumChart({ tokens, retrievedAt }: { tokens: Token[]; retrievedAt: string }) {
  const sorted = [...tokens].sort((a, b) => b.listedPremiumPct - a.listedPremiumPct);
  const span = Math.max(...sorted.map((t) => Math.abs(t.listedPremiumPct)), 10) * 1.05;
  const at = (value: number) => 50 + (value / span) * 50;
  return (
    <div className="space-y-3">
      {sorted.map((t) => {
        const over = t.listedPremiumPct > 5;
        const width = Math.max(Math.abs(at(t.listedPremiumPct) - 50), 1.5);
        const left = t.listedPremiumPct >= 0 ? 50 : 50 - width;
        return (
          <div key={t.mint} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-xs">
            <span className="flex items-center gap-2 font-medium">
              {t.image && <Image src={t.image} alt="" width={16} height={16} className="rounded-full" />}
              {t.symbol}
            </span>
            <div className="relative h-6 rounded-md bg-white/[0.02]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div className="absolute inset-y-0 w-px border-l border-dashed border-disclose/50" style={{ left: `${at(5)}%` }} />
              <div
                className={`absolute inset-y-1.5 rounded-full ${over ? "bg-disclose shadow-[0_0_16px_rgb(251_191_36/0.35)]" : t.listedPremiumPct < 0 ? "bg-white/30" : "bg-white/20"}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </div>
            <span className={`tabular text-right font-mono ${over ? "text-disclose" : "text-muted"}`}>{pct(t.listedPremiumPct)}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[6.5rem_1fr_3.5rem] gap-3 pt-1 font-mono text-[9px] whitespace-nowrap text-muted sm:text-[10px]">
        <span />
        <span className="flex justify-between">
          <span>below mark</span>
          <span className="text-disclose/80">5% policy</span>
          <span>above</span>
        </span>
        <span />
      </div>
      <p className="text-[11px] text-muted">PreStocks catalog, read {fmtDate(retrievedAt, true)}.</p>
    </div>
  );
}

export function SwapComparison({ reasons, statement }: { reasons: Reason[]; statement: string | null }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
      <Bezel inner="p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">A swap screen</p>
        <div className="mt-6 space-y-2">
          <div className="rounded-2xl bg-raised p-4 ring-1 ring-white/[0.05]">
            <p className="text-xs text-muted">You pay</p>
            <p className="mt-1 flex items-center justify-between text-2xl font-medium tracking-tight">
              2.00 <span className="rounded-full bg-white/[0.06] px-3 py-1 text-sm">USDC</span>
            </p>
          </div>
          <div className="rounded-2xl bg-raised p-4 ring-1 ring-white/[0.05]">
            <p className="text-xs text-muted">You receive</p>
            <p className="mt-1 flex items-center justify-between">
              <span className="text-sm text-muted">quoted by the route</span>
              <span className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1 text-sm">
                <Image src="https://www.prestocks.com/logos/xai.png" alt="" width={18} height={18} className="rounded-full" />
                XAI
              </span>
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.08] py-3.5 text-center text-sm font-semibold text-muted ring-1 ring-white/10">Swap</div>
        </div>
        <p className="mt-6 text-sm text-muted">An illustrative swap screen: it checks that a route exists, not what the issuer says.</p>
      </Bezel>
      <div className="rounded-[1.75rem] bg-hold/[0.04] p-1.5 ring-1 ring-hold/25">
        <div className="h-full rounded-[calc(1.75rem-0.375rem)] bg-surface p-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Preflight, same token</p>
            <StatusLight status="HOLD" />
          </div>
          <ul className="mt-6 space-y-2">
            {reasons.map((r, i) => (
              <li key={`${r.code}-${i}`} className="rounded-2xl bg-raised p-4 ring-1 ring-white/[0.05]">
                <p className="flex items-center justify-between font-mono text-xs">
                  {r.code} <span className={TONE[r.status]}>{r.status}</span>
                </p>
                <p className="mt-1.5 text-sm text-muted">{r.message}</p>
              </li>
            ))}
          </ul>
          {statement && (
            <blockquote className="mt-6 border-l border-hold/50 pl-3 text-sm leading-relaxed text-muted">
              The issuer&apos;s own words: &ldquo;{statement}&rdquo;
            </blockquote>
          )}
          <p className="mt-6 font-mono text-[11px] text-hold">No transaction built. Nothing to sign.</p>
        </div>
      </div>
    </div>
  );
}

export function DeadlineTimeline({ now }: { now: string }) {
  const start = Date.parse("2026-08-01T00:00:00Z");
  const end = Date.parse("2027-04-01T00:00:00Z");
  const pos = (iso: string) => ((Date.parse(iso) - start) / (end - start)) * 100;
  const xai = pos("2026-09-12T23:59:00Z");
  const spacex = pos("2027-03-12T23:59:00Z");
  return (
    <div className="relative mx-2 h-28">
      <div className="absolute top-12 right-0 left-0 h-px bg-white/10" />
      <div className="absolute top-12 h-px bg-gradient-to-r from-hold/70 to-disclose/70" style={{ left: `${xai}%`, width: `${spacex - xai}%` }} />
      <span className="absolute top-2 -translate-x-1/2 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px]" style={{ left: `${pos(now)}%` }}>
        today
      </span>
      <span className="absolute top-8 h-8 w-px -translate-x-1/2 bg-foreground/50" style={{ left: `${pos(now)}%` }} />
      <div className="absolute top-[2.6rem] left-0 text-left" style={{ left: `${xai}%` }}>
        <span className="block h-3 w-3 -translate-x-1/2 rounded-full bg-hold shadow-[0_0_12px_var(--hold)]" />
      </div>
      <div className="absolute top-[2.6rem]" style={{ left: `${spacex}%` }}>
        <span className="block h-3 w-3 -translate-x-1/2 rounded-full bg-disclose shadow-[0_0_12px_var(--disclose)]" />
      </div>
      <div className="absolute top-[4.4rem] left-0">
        <p className="font-mono text-[10px] text-hold">12 Sep 2026</p>
        <p className="text-xs text-muted">XAI window closed</p>
      </div>
      <div className="absolute top-[4.4rem] right-0 text-right">
        <p className="font-mono text-[10px] text-disclose">12 Mar 2027</p>
        <p className="text-xs text-muted">SPACEX deadline</p>
      </div>
    </div>
  );
}

const LAYERS = [
  { name: "PreStocks", part: "catalog API · issuer pages", file: "catalog.ts · issuer.ts", without: "Copies, paused mints and closed windows pass as the real token." },
  { name: "Token-2022", part: "fee · multiplier · pause", file: "mintState.ts", without: "The per-token price is wrong and a paused mint slips through." },
  { name: "Jupiter Swap V2", part: "order · execute", file: "jupiter.ts", without: "There is no route to price, simulate or buy." },
  { name: "Solana", part: "simulation · signatures", file: "gather.ts · submit.ts", without: "Expected amounts are guesses and the receipt has no anchor." },
];

function Layer({ name, part, file, without, side }: (typeof LAYERS)[number] & { side: "left" | "right" }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={`absolute top-1/2 hidden h-px w-10 lg:block ${side === "left" ? "-right-10 bg-gradient-to-r from-white/10 to-white/30" : "-left-10 bg-gradient-to-l from-white/10 to-white/30"}`}
      />
      <Bezel inner="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold tracking-tight">{name}</p>
          <p className="font-mono text-[10px] text-muted">{file}</p>
        </div>
        <p className="mt-1 text-xs text-muted">{part}</p>
        <p className="mt-4 font-mono text-[10px] tracking-wider text-hold/80 uppercase">Without it</p>
        <p className="mt-1 text-sm text-muted">{without}</p>
      </Bezel>
    </div>
  );
}

export function Architecture() {
  return (
    <div className="grid items-center gap-4 lg:grid-cols-[1fr_17rem_1fr] lg:gap-10">
      <div className="grid gap-4">
        {LAYERS.slice(0, 2).map((l) => (
          <Layer key={l.name} {...l} side="left" />
        ))}
      </div>
      <div className="relative">
        <div aria-hidden className="absolute inset-0 rounded-full bg-white/[0.05] blur-3xl" />
        <Bezel className="relative" inner="flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
          <div className="flex gap-2">
            <span className="h-3 w-3 rounded-full bg-hold shadow-[0_0_14px_var(--hold)]" />
            <span className="h-3 w-3 rounded-full bg-disclose shadow-[0_0_14px_var(--disclose)]" />
            <span className="h-3 w-3 rounded-full bg-clear shadow-[0_0_14px_var(--clear)]" />
          </div>
          <p className="text-xl font-semibold tracking-tight">Preflight gate</p>
          <p className="text-xs leading-relaxed text-muted">13 reason codes. Every order re-checked on the server for your wallet and amount.</p>
        </Bezel>
      </div>
      <div className="grid gap-4">
        {LAYERS.slice(2).map((l) => (
          <Layer key={l.name} {...l} side="right" />
        ))}
      </div>
    </div>
  );
}

function Perforation() {
  return (
    <div className="relative -mx-7 my-5">
      <div className="mx-7 border-t border-dashed border-[#15161a]/25" />
      <span className="absolute top-1/2 -left-3 h-6 w-6 -translate-y-1/2 rounded-full bg-background" />
      <span className="absolute top-1/2 -right-3 h-6 w-6 -translate-y-1/2 rounded-full bg-background" />
    </div>
  );
}

export function ReceiptTicket({ receipt, tilt = true }: { receipt: Receipt; tilt?: boolean }) {
  const { chainVerified: chain, appRecorded: app } = receipt;
  const tokens = (raw?: string) => (raw === undefined ? "—" : fmtTokens(tokensUi(raw, receipt.decimals, receipt.multiplier)));
  const gap = chain.tokenCreditedRaw !== undefined ? (Number(chain.tokenCreditedRaw) / Number(app.expectedNetOutRaw) - 1) * 100 : null;
  const rows: [string, string, string][] = [
    ["USDC debited", chain.usdcDebitedRaw !== undefined ? (Number(chain.usdcDebitedRaw) / 1e6).toFixed(6) : "—", "chain"],
    [`${receipt.symbol ?? "Tokens"} credited`, tokens(chain.tokenCreditedRaw), "chain"],
    ["Expected before signing", tokens(app.expectedNetOutRaw), "app"],
    ["Difference", gap === null ? "—" : `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(2)}%`, "app"],
    ["Wallet SOL spent", chain.walletSolSpentLamports !== undefined ? fmtSol(chain.walletSolSpentLamports) : "—", "chain"],
    ["Verdict", app.status, "app"],
  ];
  return (
    <div
      className={`relative mx-auto w-full max-w-md rounded-[1.5rem] bg-[#f4f1ea] p-7 text-[#15161a] shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)] transition-transform duration-700 ease-spring ${tilt ? "-rotate-1 hover:rotate-0" : ""}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold tracking-tight">Preflight receipt</p>
        <p className="font-mono text-[10px] tracking-wider text-[#15161a]/60 uppercase">{chain.blockTime ? fmtDate(chain.blockTime) : "pending"}</p>
      </div>
      <p className="mt-1 font-mono text-[10px] break-all text-[#15161a]/50">{receipt.signature}</p>
      <Perforation />
      <dl className="space-y-2.5 text-sm">
        {rows.map(([label, value, source]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-[#15161a]/65">{label}</dt>
            <dd className="tabular text-right font-mono">
              {value} <span className="ml-1 text-[9px] tracking-wider text-[#15161a]/45 uppercase">{source}</span>
            </dd>
          </div>
        ))}
      </dl>
      <Perforation />
      <p className="text-xs text-[#15161a]/60">
        Reasons: {app.reasons.map((r) => r.code).join(", ") || "none"}. Verdict SHA-256 {app.verdictHash.slice(0, 16)}…
      </p>
    </div>
  );
}
