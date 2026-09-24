import type { CheckResult } from "@/lib/check";

const TONE: Record<string, string> = { CLEAR: "text-clear", DISCLOSE: "text-disclose", HOLD: "text-hold" };
const DOT: Record<string, string> = { CLEAR: "bg-clear", DISCLOSE: "bg-disclose", HOLD: "bg-hold" };

type Props = { symbol: string; mint: string; checkedAt: string; result: CheckResult };

export function VerdictCard({ symbol, mint, checkedAt, result }: Props) {
  const lifecycle = result.reasons.find((r) => r.code === "ISSUER_WINDOW_CLOSED" || r.code === "ISSUER_DEADLINE");
  const live = typeof lifecycle?.evidence?.liveVerifiedAt === "string" ? (lifecycle.evidence.liveVerifiedAt as string) : null;
  return (
    <div className="rounded-2xl border border-line bg-surface/90 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex items-center justify-between border-b border-line px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-muted">
        <span>Live check · no wallet</span>
        <span>{checkedAt.slice(11, 19)} UTC</span>
      </div>
      <div className="space-y-5 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">{symbol}</p>
            <p className="font-mono text-[11px] text-muted">{mint}</p>
          </div>
          <span className={`flex items-center gap-2 font-mono text-sm font-semibold ${TONE[result.status]}`}>
            <span className={`h-2 w-2 rounded-full ${DOT[result.status]}`} />
            {result.status}
          </span>
        </div>
        <ul className="space-y-2">
          {result.reasons.map((r, i) => (
            <li key={`${r.code}-${i}`} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-raised px-3 py-2">
              <span className="font-mono text-xs">{r.code}</span>
              <span className={`font-mono text-[11px] ${TONE[r.status]}`}>{r.status}</span>
            </li>
          ))}
        </ul>
        {typeof lifecycle?.evidence?.statement === "string" && (
          <blockquote className="border-l-2 border-hold/60 pl-3 text-sm text-muted">&ldquo;{lifecycle.evidence.statement}&rdquo;</blockquote>
        )}
        <div className="flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
          <span>{live ? `Matched on prestocks.com at ${live.slice(11, 19)} UTC` : "Issuer page not verified live"}</span>
          <span className="font-mono">{result.signAvailable ? "signable" : "no transaction built"}</span>
        </div>
      </div>
    </div>
  );
}
