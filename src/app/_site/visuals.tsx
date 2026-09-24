import Image from "next/image";
import type { Reason } from "@/lib/check";
import { Bezel } from "./primitives";
import { StatusLight, TONE } from "./verdict-card";

type Token = { symbol: string; mint: string; image?: string; markPrice: number; tokenPrice: number; listedPremiumPct: number };

export function MiniVerdict({ symbol, logo, status, code, line }: { symbol: string; logo?: string; status: string; code: string; line: string }) {
  return (
    <Bezel>
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
            <span className={`tabular font-mono text-xs ${t.listedPremiumPct > 5 ? "text-disclose" : ""}`}>
              {t.listedPremiumPct >= 0 ? "+" : ""}
              {t.listedPremiumPct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Listed price against the issuer's own mark for every token, with the 5% policy line.
export function PremiumChart({ tokens, retrievedAt }: { tokens: Token[]; retrievedAt: string }) {
  const sorted = [...tokens].sort((a, b) => b.listedPremiumPct - a.listedPremiumPct);
  const span = Math.max(40, ...sorted.map((t) => Math.abs(t.listedPremiumPct))) * 1.1;
  const at = (pct: number) => 50 + (pct / span) * 50;
  return (
    <div className="space-y-2.5">
      {sorted.map((t) => {
        const over = t.listedPremiumPct > 5;
        const from = Math.min(at(0), at(t.listedPremiumPct));
        const width = Math.abs(at(t.listedPremiumPct) - at(0));
        return (
          <div key={t.mint} className="grid grid-cols-[6.5rem_1fr_4rem] items-center gap-3 text-xs">
            <span className="flex items-center gap-2 font-medium">
              {t.image && <Image src={t.image} alt="" width={16} height={16} className="rounded-full" />}
              {t.symbol}
            </span>
            <div className="relative h-5">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div className="absolute inset-y-0 w-px border-l border-dashed border-disclose/60" style={{ left: `${at(5)}%` }} />
              <div
                className={`absolute inset-y-1 rounded-full ${over ? "bg-disclose shadow-[0_0_16px_rgb(251_191_36/0.4)]" : "bg-white/20"}`}
                style={{ left: `${from}%`, width: `${Math.max(width, 0.6)}%` }}
              />
            </div>
            <span className={`tabular text-right font-mono ${over ? "text-disclose" : "text-muted"}`}>
              {t.listedPremiumPct >= 0 ? "+" : ""}
              {t.listedPremiumPct.toFixed(1)}%
            </span>
          </div>
        );
      })}
      <div className="flex justify-between pt-2 font-mono text-[10px] text-muted">
        <span>below mark</span>
        <span className="text-disclose/80">5% policy line</span>
        <span>above mark</span>
      </div>
      <p className="text-[11px] text-muted">PreStocks catalog, read {retrievedAt.slice(11, 19)} UTC.</p>
    </div>
  );
}

export function SwapComparison({ reasons, statement }: { reasons: Reason[]; statement: string | null }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
            <p className="mt-1 flex items-center justify-between text-2xl font-medium tracking-tight text-muted">
              —
              <span className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1 text-sm text-foreground">
                <Image src="https://www.prestocks.com/logos/xai.png" alt="" width={18} height={18} className="rounded-full" />
                XAI
              </span>
            </p>
          </div>
          <div className="rounded-2xl bg-foreground py-3.5 text-center text-sm font-semibold text-background">Swap</div>
        </div>
        <p className="mt-6 text-sm text-muted">Illustration. A swap screen asks whether a route exists. It does not ask the issuer.</p>
      </Bezel>
      <Bezel inner="p-6">
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
        {statement && <p className="mt-6 text-sm text-muted">The issuer&apos;s own words: &ldquo;{statement}&rdquo;</p>}
      </Bezel>
    </div>
  );
}

export function DeadlineTimeline({ now }: { now: string }) {
  const start = Date.parse("2026-07-01T00:00:00Z");
  const end = Date.parse("2027-04-15T00:00:00Z");
  const pos = (iso: string) => ((Date.parse(iso) - start) / (end - start)) * 100;
  const events = [
    { label: "XAI window closed", date: "2026-09-12T23:59:00Z", tone: "bg-hold shadow-[0_0_12px_var(--hold)]", text: "text-hold" },
    { label: "SPACEX deadline", date: "2027-03-12T23:59:00Z", tone: "bg-disclose shadow-[0_0_12px_var(--disclose)]", text: "text-disclose" },
  ];
  return (
    <div className="relative h-24">
      <div className="absolute top-8 right-0 left-0 h-px bg-white/10" />
      <div className="absolute top-8 h-px bg-gradient-to-r from-hold/60 to-disclose/60" style={{ left: `${pos(events[0].date)}%`, width: `${pos(events[1].date) - pos(events[0].date)}%` }} />
      {events.map((e) => (
        <div key={e.label} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pos(e.date)}%` }}>
          <p className={`font-mono text-[10px] ${e.text}`}>{e.date.slice(0, 10)}</p>
          <span className={`mx-auto mt-2 block h-3 w-3 rounded-full ${e.tone}`} />
          <p className="mt-2 text-xs whitespace-nowrap text-muted">{e.label}</p>
        </div>
      ))}
      <div className="absolute top-5 -translate-x-1/2 text-center" style={{ left: `${pos(now)}%` }}>
        <span className="mx-auto block h-6 w-px bg-foreground/60" />
        <p className="mt-6 font-mono text-[10px] text-foreground">today</p>
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

export function Architecture() {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
      <div className="grid gap-3">
        {LAYERS.slice(0, 2).map((l) => (
          <Layer key={l.name} {...l} />
        ))}
      </div>
      <div className="flex items-center justify-center">
        <Bezel className="w-full lg:w-56" inner="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-hold shadow-[0_0_10px_var(--hold)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-disclose shadow-[0_0_10px_var(--disclose)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-clear shadow-[0_0_10px_var(--clear)]" />
          </div>
          <p className="font-semibold tracking-tight">Preflight gate</p>
          <p className="text-xs text-muted">13 reason codes · every order re-checked server-side</p>
        </Bezel>
      </div>
      <div className="grid gap-3">
        {LAYERS.slice(2).map((l) => (
          <Layer key={l.name} {...l} />
        ))}
      </div>
    </div>
  );
}

function Layer({ name, part, file, without }: (typeof LAYERS)[number]) {
  return (
    <Bezel inner="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold tracking-tight">{name}</p>
        <p className="font-mono text-[10px] text-muted">{file}</p>
      </div>
      <p className="mt-1 text-xs text-muted">{part}</p>
      <p className="mt-4 text-sm">
        <span className="text-hold">Without it · </span>
        <span className="text-muted">{without}</span>
      </p>
    </Bezel>
  );
}

export function ReceiptTicket({ signature }: { signature: string }) {
  const rows = [
    ["USDC debited", "2.000000", "chain"],
    ["ANTHROPIC credited", "0.00189735", "chain"],
    ["Expected before signing", "0.00189904", "app"],
    ["Difference", "−0.09%", "app"],
    ["Wallet SOL spent", "0.001522", "chain"],
    ["Verdict", "DISCLOSE · HIGH_NETWORK_COST", "app"],
  ];
  return (
    <div className="relative mx-auto max-w-md -rotate-1 rounded-[1.5rem] bg-[#f4f1ea] p-7 text-[#15161a] shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)] transition-transform duration-700 ease-spring hover:rotate-0">
      <div className="flex items-center justify-between">
        <p className="font-semibold tracking-tight">Preflight receipt</p>
        <p className="font-mono text-[10px] tracking-wider text-[#15161a]/60">24 SEP 2026 · 02:53 UTC</p>
      </div>
      <p className="mt-1 font-mono text-[10px] break-all text-[#15161a]/50">{signature}</p>
      <div className="my-5 border-t border-dashed border-[#15161a]/25" />
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
      <div className="my-5 border-t border-dashed border-[#15161a]/25" />
      <p className="text-xs text-[#15161a]/60">Verdict SHA-256 f289360d799f110c… recomputable from the receipt JSON.</p>
      <span className="absolute top-1/2 -left-3 h-6 w-6 -translate-y-1/2 rounded-full bg-background" />
      <span className="absolute top-1/2 -right-3 h-6 w-6 -translate-y-1/2 rounded-full bg-background" />
    </div>
  );
}
