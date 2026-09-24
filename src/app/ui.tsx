import type { Reason } from "@/lib/check";
import { fmtDate } from "@/lib/format";
import { StatusLight, TONE } from "./_site/verdict-card";

export const signedPct = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

export { StatusLight };

const TITLES: Record<string, string> = {
  ISSUER_WINDOW_CLOSED: "Issuer conversion window closed",
  NOT_IN_CURRENT_CATALOG: "Not in the current PreStocks catalog",
  MINT_PAUSED: "Mint is paused",
  DEST_ACCOUNT_FROZEN: "Your token account is frozen",
  INSUFFICIENT_USDC: "Not enough USDC",
  NO_EXECUTABLE_ROUTE: "No executable route",
  SIMULATION_FAILED: "Would fail on chain",
  SOURCE_UNAVAILABLE: "A source could not be read",
  EVIDENCE_CONFLICT: "Issuer evidence conflicts",
  ISSUER_DEADLINE: "Issuer deadline ahead",
  ABOVE_MARK: "Above the issuer mark",
  THIN_ROUTE: "Thin route at this size",
  HIGH_NETWORK_COST: "High network cost",
};

const NOT_CHECKED: Record<string, string> = {
  catalog: "catalog listing",
  MINT_PAUSED: "mint pause state",
  DEST_ACCOUNT_FROZEN: "your token account",
  EVIDENCE_CONFLICT: "live issuer evidence",
  NO_EXECUTABLE_ROUTE: "route",
  ABOVE_MARK: "price vs mark",
  ABOVE_MARK_WORST_CASE: "worst-case price",
  THIN_ROUTE: "size impact",
  SIMULATION_FAILED: "simulation",
  HIGH_NETWORK_COST: "network cost",
};

function Evidence({ e }: { e?: Record<string, unknown> }) {
  if (!e) return null;
  const str = (k: string) => (typeof e[k] === "string" ? (e[k] as string) : null);
  const issuerUrl = str("issuerUrl");
  const statement = str("statement");
  const sha = str("sha256");
  const captured = str("capturedAt");
  const catalogAt = str("catalogRetrievedAt");
  const source = str("source");
  const rows: [string, React.ReactNode][] = [];

  if (issuerUrl) {
    rows.push([
      "Source",
      <a key="src" href={issuerUrl} target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-2 hover:decoration-white/60">
        {issuerUrl.replace(/^https:\/\//, "")}
      </a>,
    ]);
  }
  if ("liveVerifiedAt" in e) rows.push(["Live page", typeof e.liveVerifiedAt === "string" ? `matched ${fmtDate(e.liveVerifiedAt, true)}` : "not verified"]);
  if (sha && captured) rows.push(["Capture", `${fmtDate(captured)} · SHA-256 ${sha.slice(0, 12)}…`]);
  if (e.basis === "catalog") rows.push(["Basis", "the issuer's listed price, not your fill"]);
  if (catalogAt) rows.push(["Catalog read", fmtDate(catalogAt, true)]);
  if (source) rows.push(["Source", source]);

  return (
    <>
      {statement && <blockquote className="mt-3 border-l border-hold/50 pl-3 text-[13px] leading-relaxed text-muted">&ldquo;{statement}&rdquo;</blockquote>}
      {rows.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
          {rows.map(([label, value], i) => (
            <div key={`${label}-${i}`} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="font-mono text-[11px] text-foreground/80">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

export function ReasonList({ reasons, empty }: { reasons: Reason[]; empty: string }) {
  if (!reasons.length) return <p className="rounded-xl bg-raised px-4 py-3 text-sm text-muted ring-1 ring-white/[0.05]">{empty}</p>;
  return (
    <ul className="space-y-2">
      {reasons.map((r, i) => (
        <li key={`${r.code}-${i}`} className="rounded-xl bg-raised p-4 ring-1 ring-white/[0.05]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-tight">{TITLES[r.code] ?? r.code}</p>
              <p className="font-mono text-[10px] text-muted">{r.code}</p>
            </div>
            <span className={`font-mono text-[10px] font-semibold tracking-wider ${TONE[r.status]}`}>{r.status}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{r.message}</p>
          <Evidence e={r.evidence} />
        </li>
      ))}
    </ul>
  );
}

export function NotChecked({ codes }: { codes: string[] }) {
  const labels = [...new Set(codes.map((c) => NOT_CHECKED[c] ?? c))];
  if (!labels.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      <span>Not checked yet:</span>
      {labels.map((l) => (
        <span key={l} className="rounded-full bg-white/[0.04] px-2 py-0.5 ring-1 ring-white/[0.06]">
          {l}
        </span>
      ))}
    </div>
  );
}
