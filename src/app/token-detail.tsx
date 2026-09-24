import Image from "next/image";
import { fmtDate, fmtUsd } from "@/lib/format";
import type { TokenDetail } from "@/lib/market";
import { PriceChart } from "./price-chart";
import { signedPct } from "./ui";

const compactUsd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

function Sentiment({ pool }: { pool: NonNullable<TokenDetail["pool"]> }) {
  const total = pool.buys24h + pool.sells24h;
  const buyShare = total ? (pool.buys24h / total) * 100 : 50;
  return (
    <div className="space-y-2">
      <div className="flex justify-between font-mono text-[11px]">
        <span className="text-clear">{pool.buys24h.toLocaleString("en-US")} buys</span>
        <span className="text-hold">{pool.sells24h.toLocaleString("en-US")} sells</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="bg-clear" style={{ width: `${buyShare}%` }} />
        <div className="flex-1 bg-hold" />
      </div>
      <p className="text-[11px] text-muted">
        {pool.buyers24h.toLocaleString("en-US")} buyers and {pool.sellers24h.toLocaleString("en-US")} sellers in 24h on the {pool.name} pool.
      </p>
    </div>
  );
}

export function TokenDetailView({ detail, livePrice }: { detail: TokenDetail; livePrice: number | null }) {
  const price = livePrice ?? detail.tokenPrice;
  const vsMark = (price / detail.markPrice - 1) * 100;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {detail.image && <Image src={detail.image} alt={`${detail.symbol} logo`} width={44} height={44} className="rounded-full ring-1 ring-white/10" />}
          <div>
            <p className="text-2xl leading-none font-semibold tracking-tight">{detail.name.replace(/ PreStocks$/, "")}</p>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {detail.symbol} · {detail.mint.slice(0, 4)}…{detail.mint.slice(-4)}
            </p>
          </div>
        </div>
        <div className="text-right">
          {livePrice !== null ? (
            <p className="flex items-center justify-end gap-1.5 font-mono text-[10px] tracking-wider text-clear uppercase">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clear" /> Live
            </p>
          ) : (
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Listed price</p>
          )}
        </div>
      </div>

      <PriceChart key={detail.mint} mint={detail.mint} initial={detail.candles} mark={detail.markPrice} live={livePrice} />
      <p className={`font-mono text-[11px] ${vsMark > 5 ? "text-disclose" : "text-muted"}`}>
        {livePrice !== null ? "Live" : "Listed"} price {fmtUsd(price)} is {signedPct(vsMark)} against the issuer mark of {fmtUsd(detail.markPrice)}.
      </p>

      {detail.description && <p className="text-sm leading-relaxed text-muted text-pretty">{detail.description}</p>}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.06]">
        {[
          ["Issuer mark", fmtUsd(detail.markPrice)],
          ["Listed price", fmtUsd(detail.tokenPrice)],
          ["Mark valuation", detail.markValuation ? compactUsd(detail.markValuation) : "—"],
          ["Market-implied", detail.impliedValuation ? compactUsd(detail.impliedValuation) : "—"],
          ["Pool liquidity", detail.pool?.liquidityUsd ? compactUsd(detail.pool.liquidityUsd) : "—"],
          ["Display multiplier", detail.multiplier === 1 ? "none" : `×${Number(detail.multiplier.toFixed(3))}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="text-[11px] text-muted">{label}</dt>
            <dd className="tabular mt-0.5 font-mono text-sm">{value}</dd>
          </div>
        ))}
      </dl>

      {detail.pool && (
        <div>
          <p className="mb-3 text-xs font-medium text-muted">Pool flow, last 24 hours</p>
          <Sentiment pool={detail.pool} />
        </div>
      )}

      <div>
        <p className="mb-3 text-xs font-medium text-muted">Issuer timeline</p>
        {detail.lifecycle ? (
          <div className="flex gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${detail.lifecycle.state === "window_closed" ? "bg-hold" : "bg-disclose"}`} />
            <div>
              <p className="text-sm">
                {detail.lifecycle.state === "window_closed" ? "Conversion window closed" : "Conversion deadline"} · {fmtDate(detail.lifecycle.deadline)}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">&ldquo;{detail.lifecycle.statement}&rdquo;</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            No IPO or conversion date published by the issuer.{" "}
            {detail.issuerUrl && (
              <a href={detail.issuerUrl} target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-2 hover:decoration-white/60">
                Issuer page
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
