import Image from "next/image";
import { fmtDate, fmtUsd } from "@/lib/format";
import { signedPct } from "./ui";

export type CatalogView = {
  retrievedAt: string;
  tokens: {
    symbol: string;
    name: string;
    mint: string;
    image?: string;
    markPrice: number;
    tokenPrice: number;
    listedPremiumPct: number;
    deadline: string | null;
  }[];
  retired: { symbol: string; mint: string; deadline: string; statement?: string }[];
};

export type LiveQuote = { price: number; move: "up" | "down" | null };

type Props = { catalog: CatalogView; selected: string; onPick: (mint: string) => void; live: Record<string, LiveQuote>; liveAt: string | null };

export function CatalogTable({ catalog, selected, onPick, live, liveAt }: Props) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto_4.5rem] px-3 pb-2 font-mono text-[10px] tracking-wider text-muted uppercase">
        <span>Token</span>
        <span className="text-right">Live price</span>
        <span className="text-right">vs mark</span>
      </div>
      {catalog.tokens.map((t) => {
        const active = t.mint === selected;
        const quote = live[t.mint];
        const price = quote?.price ?? t.tokenPrice;
        const premium = (price / t.markPrice - 1) * 100;
        const over = premium > 5;
        return (
          <button
            key={t.mint}
            onClick={() => onPick(t.mint)}
            className={`grid w-full grid-cols-[1fr_auto_4.5rem] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-300 ease-spring ${
              active ? "bg-white/[0.07] ring-1 ring-white/10" : "hover:bg-white/[0.04]"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {t.image && <Image src={t.image} alt="" width={24} height={24} className="rounded-full ring-1 ring-white/10" />}
              <span className="font-medium tracking-tight">{t.symbol}</span>
              {t.deadline && <span className="rounded-full bg-disclose/15 px-2 py-0.5 font-mono text-[9px] text-disclose">deadline</span>}
            </span>
            <span
              key={price}
              title={quote ? "Live on-chain price" : "Listed price; no live quote right now"}
              className={`tabular rounded-md px-1.5 text-right font-mono text-[13px] ${quote ? "" : "text-muted"} ${quote?.move === "up" ? "animate-tick-up" : quote?.move === "down" ? "animate-tick-down" : ""}`}
            >
              {fmtUsd(price)}
              {!quote && <span className="ml-1 text-[9px] tracking-wider uppercase">listed</span>}
            </span>
            <span className={`tabular text-right font-mono text-[12px] ${over ? "text-disclose" : "text-muted"}`}>{signedPct(premium)}</span>
          </button>
        );
      })}
      {catalog.retired.map((r) => (
        <button
          key={r.mint}
          onClick={() => onPick(r.mint)}
          className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-300 ${
            r.mint === selected ? "bg-white/[0.07] ring-1 ring-white/10" : "hover:bg-white/[0.04]"
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Image src="https://www.prestocks.com/logos/xai.png" alt="" width={24} height={24} className="rounded-full opacity-60 ring-1 ring-white/10" />
            <span className="font-medium tracking-tight text-muted line-through decoration-hold/60">{r.symbol}</span>
          </span>
          <span className="font-mono text-[11px] text-hold/80">window closed {fmtDate(r.deadline).split(",")[0]}</span>
        </button>
      ))}
      <p className="flex items-center gap-2 px-3 pt-2 text-[11px] text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${liveAt ? "animate-pulse bg-clear" : "bg-muted"}`} />
        {liveAt ? `Live on-chain prices from GeckoTerminal, updated ${fmtDate(liveAt, true)}.` : "Listed prices from the PreStocks catalog."} Marks from
        PreStocks, read {fmtDate(catalog.retrievedAt, true)}.
      </p>
    </div>
  );
}
