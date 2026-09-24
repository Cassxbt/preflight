import Image from "next/image";
import type { CheckResult } from "@/lib/check";
import { Bezel } from "./primitives";

export const TONE: Record<string, string> = { CLEAR: "text-clear", DISCLOSE: "text-disclose", HOLD: "text-hold", PREVIEW: "text-muted" };
const GLOW: Record<string, string> = {
  CLEAR: "bg-clear shadow-[0_0_12px_var(--clear)]",
  DISCLOSE: "bg-disclose shadow-[0_0_12px_var(--disclose)]",
  HOLD: "bg-hold shadow-[0_0_12px_var(--hold)]",
  PREVIEW: "bg-muted",
};

export function StatusLight({ status }: { status: string }) {
  return (
    <span className={`flex items-center gap-2 font-mono text-xs font-semibold tracking-wider ${TONE[status]}`}>
      <span className={`h-2 w-2 rounded-full ${GLOW[status]}`} />
      {status}
    </span>
  );
}

type Props = { symbol: string; mint: string; checkedAt: string; result: CheckResult; logo?: string };

export function VerdictCard({ symbol, mint, checkedAt, result, logo }: Props) {
  const lifecycle = result.reasons.find((r) => r.code === "ISSUER_WINDOW_CLOSED" || r.code === "ISSUER_DEADLINE");
  const live = typeof lifecycle?.evidence?.liveVerifiedAt === "string" ? (lifecycle.evidence.liveVerifiedAt as string) : null;
  const statement = typeof lifecycle?.evidence?.statement === "string" ? (lifecycle.evidence.statement as string) : null;
  return (
    <Bezel className="shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <span>Live check · no wallet</span>
        <span className="tabular">{checkedAt.slice(11, 19)} UTC</span>
      </div>
      <div className="space-y-5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {logo && <Image src={logo} alt={`${symbol} logo`} width={36} height={36} className="rounded-full ring-1 ring-white/10" />}
            <div>
              <p className="text-lg font-semibold tracking-tight">{symbol}</p>
              <p className="font-mono text-[10px] text-muted">
                {mint.slice(0, 6)}…{mint.slice(-6)}
              </p>
            </div>
          </div>
          <StatusLight status={result.status} />
        </div>
        <ul className="space-y-1.5">
          {result.reasons.map((r, i) => (
            <li key={`${r.code}-${i}`} className="flex items-center justify-between gap-4 rounded-xl bg-raised px-3 py-2.5 ring-1 ring-white/[0.05]">
              <span className="font-mono text-[11px]">{r.code}</span>
              <span className={`font-mono text-[10px] ${TONE[r.status]}`}>{r.status}</span>
            </li>
          ))}
        </ul>
        {statement && <blockquote className="border-l border-hold/50 pl-3 text-[13px] leading-relaxed text-muted">&ldquo;{statement}&rdquo;</blockquote>}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-muted">
          <span>{live ? `Matched on prestocks.com · ${live.slice(11, 19)} UTC` : "Issuer page not verified live"}</span>
          <span className="font-mono">{result.signAvailable ? "signable" : "no tx built"}</span>
        </div>
      </div>
    </Bezel>
  );
}
