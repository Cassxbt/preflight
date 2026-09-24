import type { Reason } from "@/lib/check";

export const utc = (iso: string) => `${iso.slice(11, 19)} UTC`;
export const signedPct = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

const BADGE: Record<string, string> = {
  CLEAR: "bg-emerald-600 text-white",
  DISCLOSE: "bg-amber-400 text-black",
  HOLD: "bg-red-600 text-white",
  PREVIEW: "border border-current/40",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 font-mono text-xs font-semibold tracking-wide ${BADGE[status] ?? ""}`}>{status}</span>;
}

const TITLES: Record<string, string> = {
  ISSUER_WINDOW_CLOSED: "Issuer conversion window closed",
  NOT_IN_CURRENT_CATALOG: "Not in the current PreStocks catalog",
  MINT_PAUSED: "Mint is paused",
  DEST_ACCOUNT_FROZEN: "Your token account is frozen",
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
  const live = e.liveVerifiedAt;
  const catalogAt = str("catalogRetrievedAt");
  const source = str("source");
  const lines: React.ReactNode[] = [];

  if (statement) lines.push(<q key="q">{statement}</q>);
  if (issuerUrl) {
    lines.push(
      <span key="src">
        Source{" "}
        <a href={issuerUrl} target="_blank" rel="noreferrer" className="underline">
          {issuerUrl.replace(/^https:\/\//, "")}
        </a>
        {typeof live === "string" ? `, verified on the live page at ${utc(live)}` : live === null ? ", not verified on the live page" : ""}
      </span>,
    );
  }
  if (sha && captured) lines.push(<span key="sha">Reviewed capture {captured.slice(0, 10)}, SHA-256 {sha.slice(0, 12)}…</span>);
  if (e.basis === "catalog") lines.push(<span key="basis">Basis: the issuer&apos;s listed token price, not your fill</span>);
  if (catalogAt) lines.push(<span key="cat">Catalog read at {utc(catalogAt)}</span>);
  if (source) lines.push(<span key="source">Source: {source}</span>);
  if (!lines.length) return null;
  return <div className="mt-1 flex flex-col gap-0.5 text-xs opacity-60">{lines}</div>;
}

export function ReasonList({ reasons, empty }: { reasons: Reason[]; empty: string }) {
  if (!reasons.length) return <p className="text-sm opacity-70">{empty}</p>;
  return (
    <ul className="space-y-3">
      {reasons.map((r, i) => (
        <li key={`${r.code}-${i}`} className="text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <span className="font-semibold">{TITLES[r.code] ?? r.code}</span>
            <span className="font-mono text-xs opacity-50">{r.code}</span>
          </div>
          <p className="mt-1 opacity-80">{r.message}</p>
          <Evidence e={r.evidence} />
        </li>
      ))}
    </ul>
  );
}

export function NotChecked({ codes }: { codes: string[] }) {
  const labels = [...new Set(codes.map((c) => NOT_CHECKED[c] ?? c))];
  if (!labels.length) return null;
  return <p className="text-xs opacity-60">Not checked yet: {labels.join(", ")}.</p>;
}
