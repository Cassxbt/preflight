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

export type LifecycleEvidence = { symbol: string; deadline: string; issuerUrl: string; statement: string; capturedAt: string; sha256: string };

export type CheckInput = {
  mint: string;
  now: string;
  retired?: LifecycleEvidence;
  deadlineAhead?: LifecycleEvidence;
  issuer?: Outcome<{ fetchedAt: string; mintLinked: boolean; statementPresent: boolean; linkedMints: string[]; captureIntact: boolean }>;
  catalog: Outcome<{
    listed: boolean;
    symbol?: string;
    markPrice?: number;
    tokenPrice?: number;
    retrievedAt: string;
    mintForLifecycleSymbol?: string | null;
  }>;
  mintState: Outcome<{ paused: boolean | null; decimals: number; multiplier: number; feeBps: number | null }>;
  destAccount?: Outcome<{ exists: boolean; frozen: boolean }>;
  quote?: Outcome<{ hasRoute: boolean; sizeImpactPct: number | null; usdcInRaw: bigint; netOutRaw: bigint; minOutRaw: bigint | null }>;
  simulation?: Outcome<{ succeeded: boolean; creditRaw: bigint; walletSolCostLamports: number; error?: string }>;
  policy?: { maxSolCostLamports: number; maxSolCostPctOfOrder: number; solUsd: number | null };
};

export type CheckResult = {
  status: Status;
  signAvailable: boolean;
  reasons: Reason[];
  notEvaluated: string[];
  metrics: {
    executablePrice?: number;
    premiumPct?: number;
    worstPrice?: number;
    worstPremiumPct?: number;
    listedPremiumPct?: number;
    sizeImpactPct?: number;
    netOutUi?: number;
    walletSolCostLamports?: number;
  };
};

const SEVERITY: Record<Exclude<Status, "CLEAR">, number> = { HOLD: 2, DISCLOSE: 1 };

// HOLD before DISCLOSE; within a status, the primary refusal comes first.
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
const SIGNING_REQUIRES = ["MINT_PAUSED", "DEST_ACCOUNT_FROZEN", "NO_EXECUTABLE_ROUTE", "SIMULATION_FAILED", "EVIDENCE_CONFLICT", "catalog"];

export const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60_000;

export function runCheck(input: CheckInput): CheckResult {
  const reasons: Reason[] = [];
  const notEvaluated: string[] = [];
  const metrics: CheckResult["metrics"] = {};
  const hold = (code: ReasonCode, message: string, evidence?: Record<string, unknown>) => reasons.push({ code, status: "HOLD", message, evidence });
  const disclose = (code: ReasonCode, message: string, evidence?: Record<string, unknown>) =>
    reasons.push({ code, status: "DISCLOSE", message, evidence });

  const lifecycle = input.retired ?? input.deadlineAhead;
  const issuer = input.issuer?.ok ? input.issuer.value : null;
  const liveVerifiedAt = issuer && issuer.captureIntact && issuer.mintLinked && issuer.statementPresent ? issuer.fetchedAt : null;

  if (input.retired) {
    const r = input.retired;
    hold("ISSUER_WINDOW_CLOSED", `The issuer-defined ${r.symbol} conversion window closed on ${r.deadline}.`, {
      issuerUrl: r.issuerUrl,
      statement: r.statement,
      capturedAt: r.capturedAt,
      sha256: r.sha256,
      liveVerifiedAt,
    });
  }

  if (lifecycle) {
    if (input.issuer === undefined) {
      notEvaluated.push("EVIDENCE_CONFLICT");
    } else if (!input.issuer.ok) {
      hold("SOURCE_UNAVAILABLE", `Issuer page unavailable: ${input.issuer.error}`, { source: "issuer", issuerUrl: lifecycle.issuerUrl });
      notEvaluated.push("EVIDENCE_CONFLICT");
    } else if (Date.parse(input.now) - Date.parse(input.issuer.value.fetchedAt) > MAX_EVIDENCE_AGE_MS) {
      hold("SOURCE_UNAVAILABLE", `Issuer evidence is older than 24 hours (fetched ${input.issuer.value.fetchedAt}).`, { source: "issuer" });
      notEvaluated.push("EVIDENCE_CONFLICT");
    } else {
      const e = input.issuer.value;
      const catalogMint = input.catalog.ok ? input.catalog.value.mintForLifecycleSymbol : null;
      const conflicts = [
        !e.captureIntact && "the reviewed capture no longer matches its recorded SHA-256",
        !e.mintLinked && `the issuer page no longer links this mint (links: ${e.linkedMints.join(", ") || "none"})`,
        !e.statementPresent && "the issuer page no longer contains the reviewed lifecycle terms",
        catalogMint && catalogMint !== input.mint && `the catalog lists ${lifecycle.symbol} under a different mint (${catalogMint})`,
      ].filter((c): c is string => typeof c === "string");
      if (conflicts.length) {
        hold("EVIDENCE_CONFLICT", `Issuer evidence disagrees: ${conflicts.join("; ")}.`, { issuerUrl: lifecycle.issuerUrl, fetchedAt: e.fetchedAt });
      }
    }
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
      liveVerifiedAt,
    });
  }

  if (input.quote === undefined) {
    notEvaluated.push("NO_EXECUTABLE_ROUTE", "THIN_ROUTE");
    // Without a wallet there is no fill to price, but the issuer's own listed price is already a warning.
    const listing = input.catalog.ok ? input.catalog.value : null;
    if (listing?.listed && listing.markPrice && listing.tokenPrice) {
      const listedPremiumPct = (listing.tokenPrice / listing.markPrice - 1) * 100;
      metrics.listedPremiumPct = listedPremiumPct;
      if (listedPremiumPct > ABOVE_MARK_THRESHOLD_PCT) {
        disclose(
          "ABOVE_MARK",
          `PreStocks lists this token at $${listing.tokenPrice.toFixed(2)}, ${listedPremiumPct.toFixed(1)}% above its own mark of $${listing.markPrice.toFixed(2)} (policy threshold ${ABOVE_MARK_THRESHOLD_PCT}%). Your price at your size is checked when you prepare an order.`,
          { basis: "catalog", markPrice: listing.markPrice, tokenPrice: listing.tokenPrice, catalogRetrievedAt: listing.retrievedAt },
        );
      }
    } else if (input.catalog.ok) {
      notEvaluated.push("ABOVE_MARK");
    }
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
      const mark = input.catalog.value.markPrice;
      const usdc = Number(q.usdcInRaw) / 1e6;
      const toUi = (raw: bigint) => (Number(raw) / 10 ** m.decimals) * m.multiplier;
      const netOutUi = toUi(q.netOutRaw);
      if (netOutUi > 0) {
        const price = usdc / netOutUi;
        const premiumPct = (price / mark - 1) * 100;
        Object.assign(metrics, { netOutUi, executablePrice: price, premiumPct });

        // The policy has to hold for the worst fill the transaction allows, not only the expected one.
        const minOutUi = q.minOutRaw !== null ? toUi(q.minOutRaw) : 0;
        const worstPrice = minOutUi > 0 ? usdc / minOutUi : null;
        const worstPremiumPct = worstPrice !== null ? (worstPrice / mark - 1) * 100 : null;
        if (worstPrice !== null && worstPremiumPct !== null) Object.assign(metrics, { worstPrice, worstPremiumPct });
        else notEvaluated.push("ABOVE_MARK_WORST_CASE");

        const evidence = { markPrice: mark, executablePrice: price, worstPrice, catalogRetrievedAt: input.catalog.value.retrievedAt };
        const worstText =
          worstPrice !== null && worstPremiumPct !== null
            ? ` If the swap fills at its minimum you pay up to $${worstPrice.toFixed(2)} (${worstPremiumPct.toFixed(1)}% above).`
            : "";
        if (premiumPct > ABOVE_MARK_THRESHOLD_PCT) {
          disclose(
            "ABOVE_MARK",
            `You pay $${price.toFixed(2)} per token, ${premiumPct.toFixed(1)}% above the issuer mark of $${mark.toFixed(2)} (policy threshold ${ABOVE_MARK_THRESHOLD_PCT}%).${worstText}`,
            evidence,
          );
        } else if (worstPremiumPct !== null && worstPremiumPct > ABOVE_MARK_THRESHOLD_PCT) {
          disclose(
            "ABOVE_MARK",
            `Expected $${price.toFixed(2)} per token (${premiumPct.toFixed(1)}% vs the issuer mark of $${mark.toFixed(2)}), but the route allows a fill at up to $${worstPrice!.toFixed(2)}, ${worstPremiumPct.toFixed(1)}% above the mark (policy threshold ${ABOVE_MARK_THRESHOLD_PCT}%).`,
            evidence,
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
