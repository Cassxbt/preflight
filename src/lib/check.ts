import { ABOVE_MARK_THRESHOLD_PCT, THIN_ROUTE_THRESHOLD_PCT } from "./constants";

export type Status = "CLEAR" | "DISCLOSE" | "HOLD";

export type ReasonCode =
  | "ISSUER_WINDOW_CLOSED"
  | "NOT_IN_CURRENT_CATALOG"
  | "MINT_PAUSED"
  | "DEST_ACCOUNT_FROZEN"
  | "NO_EXECUTABLE_ROUTE"
  | "SIMULATION_FAILED"
  | "SOURCE_UNAVAILABLE"
  | "EVIDENCE_CONFLICT"
  | "ISSUER_DEADLINE"
  | "ABOVE_MARK"
  | "THIN_ROUTE"
  | "HIGH_NETWORK_COST";

export type Reason = { code: ReasonCode; status: Exclude<Status, "CLEAR">; message: string; evidence?: Record<string, unknown> };

// Every input is either a value, an error string (source failed), or undefined (not evaluated yet).
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export type CheckInput = {
  mint: string;
  now: string;
  retired?: { symbol: string; deadline: string; issuerUrl: string; statement: string; capturedAt: string; sha256: string };
  deadlineAhead?: { symbol: string; deadline: string; issuerUrl: string; statement: string; capturedAt: string; sha256: string };
  catalog: Outcome<{ listed: boolean; symbol?: string; markPrice?: number; retrievedAt: string }>;
  mintState: Outcome<{ paused: boolean | null; decimals: number; multiplier: number; feeBps: number | null }>;
  destAccount?: Outcome<{ exists: boolean; frozen: boolean }>;
  quote?: Outcome<{ hasRoute: boolean; sizeImpactPct: number | null; usdcInRaw: bigint; netOutRaw: bigint }>;
  simulation?: Outcome<{ succeeded: boolean; creditRaw: bigint; walletSolCostLamports: number; error?: string }>;
  policy?: { maxSolCostLamports: number; maxSolCostPctOfOrder: number; solUsd: number | null };
};

export type CheckResult = {
  status: Status;
  signAvailable: boolean;
  reasons: Reason[];
  notEvaluated: string[];
  metrics: { executablePrice?: number; premiumPct?: number; sizeImpactPct?: number; netOutUi?: number; walletSolCostLamports?: number };
};

const SEVERITY: Record<Exclude<Status, "CLEAR">, number> = { HOLD: 2, DISCLOSE: 1 };

// Primary refusal first; within a status, the order reasons are pushed is the display order.
const PRIMARY_ORDER: ReasonCode[] = [
  "ISSUER_WINDOW_CLOSED",
  "EVIDENCE_CONFLICT",
  "MINT_PAUSED",
  "DEST_ACCOUNT_FROZEN",
  "NOT_IN_CURRENT_CATALOG",
  "SOURCE_UNAVAILABLE",
  "NO_EXECUTABLE_ROUTE",
  "SIMULATION_FAILED",
  "ISSUER_DEADLINE",
  "ABOVE_MARK",
  "THIN_ROUTE",
  "HIGH_NETWORK_COST",
];

// A transaction may only be offered when every check that can block it has actually run.
const SIGNING_REQUIRES = ["MINT_PAUSED", "DEST_ACCOUNT_FROZEN", "NO_EXECUTABLE_ROUTE", "SIMULATION_FAILED", "catalog"];

export function runCheck(input: CheckInput): CheckResult {
  const reasons: Reason[] = [];
  const notEvaluated: string[] = [];
  const metrics: CheckResult["metrics"] = {};
  const hold = (code: ReasonCode, message: string, evidence?: Record<string, unknown>) => reasons.push({ code, status: "HOLD", message, evidence });
  const disclose = (code: ReasonCode, message: string, evidence?: Record<string, unknown>) =>
    reasons.push({ code, status: "DISCLOSE", message, evidence });

  if (input.retired) {
    const r = input.retired;
    hold("ISSUER_WINDOW_CLOSED", `The issuer-defined ${r.symbol} conversion window closed on ${r.deadline}.`, {
      issuerUrl: r.issuerUrl,
      statement: r.statement,
      capturedAt: r.capturedAt,
      sha256: r.sha256,
    });
  }

  if (!input.catalog.ok) {
    hold("SOURCE_UNAVAILABLE", `PreStocks catalog unavailable: ${input.catalog.error}`, { source: "catalog" });
    notEvaluated.push("catalog", "ABOVE_MARK");
  } else if (!input.catalog.value.listed) {
    hold("NOT_IN_CURRENT_CATALOG", "This mint is not in the current PreStocks catalog.", { catalogRetrievedAt: input.catalog.value.retrievedAt });
  }

  if (!input.mintState.ok) {
    hold("SOURCE_UNAVAILABLE", `On-chain mint state unavailable: ${input.mintState.error}`, { source: "rpc" });
    notEvaluated.push("MINT_PAUSED");
  } else if (input.mintState.value.paused === true) {
    hold("MINT_PAUSED", "The token's issuer has paused this mint (Token-2022 PausableConfig).");
  }

  if (input.destAccount === undefined) {
    notEvaluated.push("DEST_ACCOUNT_FROZEN");
  } else if (!input.destAccount.ok) {
    hold("SOURCE_UNAVAILABLE", `Destination account state unavailable: ${input.destAccount.error}`, { source: "rpc" });
  } else if (input.destAccount.value.exists && input.destAccount.value.frozen) {
    hold("DEST_ACCOUNT_FROZEN", "Your token account for this mint is frozen.");
  }

  if (input.deadlineAhead) {
    const d = input.deadlineAhead;
    disclose("ISSUER_DEADLINE", `Issuer deadline ahead: ${d.statement}`, {
      deadline: d.deadline,
      issuerUrl: d.issuerUrl,
      capturedAt: d.capturedAt,
      sha256: d.sha256,
    });
  }

  if (input.quote === undefined) {
    notEvaluated.push("NO_EXECUTABLE_ROUTE", "ABOVE_MARK", "THIN_ROUTE");
  } else if (!input.quote.ok) {
    hold("SOURCE_UNAVAILABLE", `Quote unavailable: ${input.quote.error}`, { source: "jupiter" });
    notEvaluated.push("ABOVE_MARK", "THIN_ROUTE");
  } else if (!input.quote.value.hasRoute) {
    hold("NO_EXECUTABLE_ROUTE", "No executable route for this token at this size.");
  } else {
    const q = input.quote.value;
    if (q.sizeImpactPct === null) {
      notEvaluated.push("THIN_ROUTE");
    } else {
      metrics.sizeImpactPct = q.sizeImpactPct;
      if (q.sizeImpactPct > THIN_ROUTE_THRESHOLD_PCT) {
        disclose(
          "THIN_ROUTE",
          `At this size you get ${q.sizeImpactPct.toFixed(2)}% fewer tokens per dollar than a $1 order on the same market (policy threshold ${THIN_ROUTE_THRESHOLD_PCT}%).`,
        );
      }
    }
    if (input.mintState.ok && input.catalog.ok && input.catalog.value.markPrice) {
      const m = input.mintState.value;
      const netOutUi = (Number(q.netOutRaw) / 10 ** m.decimals) * m.multiplier;
      if (netOutUi > 0) {
        const price = Number(q.usdcInRaw) / 1e6 / netOutUi;
        const premiumPct = (price / input.catalog.value.markPrice - 1) * 100;
        Object.assign(metrics, { netOutUi, executablePrice: price, premiumPct });
        if (premiumPct > ABOVE_MARK_THRESHOLD_PCT) {
          disclose(
            "ABOVE_MARK",
            `You pay $${price.toFixed(2)} per token, ${premiumPct.toFixed(1)}% above the issuer mark of $${input.catalog.value.markPrice.toFixed(2)} (policy threshold ${ABOVE_MARK_THRESHOLD_PCT}%).`,
            { markPrice: input.catalog.value.markPrice, executablePrice: price, catalogRetrievedAt: input.catalog.value.retrievedAt },
          );
        }
      }
    }
  }

  if (input.simulation === undefined) {
    notEvaluated.push("SIMULATION_FAILED", "HIGH_NETWORK_COST");
  } else if (!input.simulation.ok) {
    hold("SOURCE_UNAVAILABLE", `Simulation unavailable: ${input.simulation.error}`, { source: "rpc" });
  } else if (!input.simulation.value.succeeded) {
    hold("SIMULATION_FAILED", `The transaction would fail on chain: ${input.simulation.value.error ?? "unknown error"}.`);
  } else if (!input.policy) {
    notEvaluated.push("HIGH_NETWORK_COST");
  } else {
    const cost = input.simulation.value.walletSolCostLamports;
    metrics.walletSolCostLamports = cost;
    const orderUsd = input.quote?.ok ? Number(input.quote.value.usdcInRaw) / 1e6 : null;
    const costUsd = input.policy.solUsd !== null ? (cost / 1e9) * input.policy.solUsd : null;
    const pctOfOrder = costUsd !== null && orderUsd ? (costUsd / orderUsd) * 100 : null;
    const tooHigh = cost > input.policy.maxSolCostLamports || (pctOfOrder !== null && pctOfOrder > input.policy.maxSolCostPctOfOrder);
    if (tooHigh) {
      const opensAccount = input.destAccount?.ok && !input.destAccount.value.exists;
      const why = opensAccount
        ? "most of it is rent to open your token account for this mint, refundable if you later close that account"
        : "this route may open token accounts in your wallet; their rent comes back only if you later close them";
      disclose("HIGH_NETWORK_COST", `This order costs your wallet ${(cost / 1e9).toFixed(6)} SOL in network fees and rent; ${why}.`, {
        walletSolCostLamports: cost,
        pctOfOrder,
      });
    }
  }

  reasons.sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || PRIMARY_ORDER.indexOf(a.code) - PRIMARY_ORDER.indexOf(b.code));
  const status: Status = reasons.some((r) => r.status === "HOLD") ? "HOLD" : reasons.length ? "DISCLOSE" : "CLEAR";

  const unique = [...new Set(notEvaluated)];
  const signAvailable = status !== "HOLD" && !unique.some((c) => SIGNING_REQUIRES.includes(c));
  return { status, signAvailable, reasons, notEvaluated: unique, metrics };
}
