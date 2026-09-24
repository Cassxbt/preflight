import { calculateFee } from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import { runCheck, type CheckInput, type Outcome } from "./check";
import { activeFee, effectiveMultiplier } from "./mintState";

const ok = <T,>(value: T): Outcome<T> => ({ ok: true, value });
const fail = (error: string): Outcome<never> => ({ ok: false, error });

const NOW = "2026-09-24T03:00:00.000Z";
const ANTHROPIC = "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw";

const XAI_EVIDENCE = {
  symbol: "XAI",
  deadline: "2026-09-12T23:59:00Z",
  issuerUrl: "https://prestocks.com/xai",
  statement: "Each XAI token must be swapped into 0.7165 SPACEX before 11:59pm UTC on 12 September 2026, or it will expire worthless.",
  capturedAt: "2026-09-23T15:12:32Z",
  sha256: "e89091221dc90dfd8027070831866cde721eb058edbf441dd2d4a0cba463462b",
};

const SPACEX_EVIDENCE = {
  symbol: "SPACEX",
  deadline: "2027-03-12T23:59:00Z",
  issuerUrl: "https://prestocks.com/spacex",
  statement:
    "SpaceX PreStocks tokens must be swapped into $SPCXx or any other token before 11:59pm UTC on 12 March 2027, or they will expire worthless.",
  capturedAt: "2026-09-23T15:13:27Z",
  sha256: "3ef40229c0b7958a9bf7eee625cf1cc974ade979a57a766a2f39814579d2d654",
};

// The M1 in-app purchase: 2 USDC in, 1,897,345 raw ANTHROPIC credited (9 decimals, multiplier 1).
function final(over: Partial<CheckInput> = {}): CheckInput {
  return {
    mint: ANTHROPIC,
    now: NOW,
    catalog: ok({ listed: true, symbol: "ANTHROPIC", markPrice: 1038.61, retrievedAt: NOW }),
    mintState: ok({ paused: false, decimals: 9, multiplier: 1, feeBps: 100 }),
    destAccount: ok({ exists: true, frozen: false }),
    quote: ok({ hasRoute: true, sizeImpactPct: 0.01, usdcInRaw: 2_000_000n, netOutRaw: 1_897_345n }),
    simulation: ok({ succeeded: true, creditRaw: 1_897_345n, walletSolCostLamports: 6_000 }),
    policy: { maxSolCostLamports: 50_000, maxSolCostPctOfOrder: 0.5, solUsd: 200 },
    ...over,
  };
}

function preview(over: Partial<CheckInput> = {}): CheckInput {
  const { destAccount: _d, quote: _q, simulation: _s, policy: _p, ...rest } = final(over);
  return rest;
}

const verified = (over: Partial<{ fetchedAt: string; mintLinked: boolean; statementPresent: boolean; linkedMints: string[]; captureIntact: boolean }> = {}) =>
  ok({ fetchedAt: NOW, mintLinked: true, statementPresent: true, linkedMints: [], captureIntact: true, ...over });

const codes = (input: CheckInput) => runCheck(input).reasons.map((r) => r.code);
const priceOf = (input: CheckInput) => runCheck(input).metrics.executablePrice!;

describe("canonical buy", () => {
  it("is CLEAR and signable when every check ran and nothing triggered", () => {
    const r = runCheck(final());
    expect(r).toMatchObject({ status: "CLEAR", signAvailable: true, reasons: [], notEvaluated: [] });
    expect(r.metrics.premiumPct).toBeCloseTo((2 / 0.001897345 / 1038.61 - 1) * 100, 10);
  });

  it("never offers signing from a preview, even when it is CLEAR", () => {
    const r = runCheck(preview());
    expect(r.status).toBe("CLEAR");
    expect(r.signAvailable).toBe(false);
    expect(r.notEvaluated).toEqual(expect.arrayContaining(["DEST_ACCOUNT_FROZEN", "NO_EXECUTABLE_ROUTE", "SIMULATION_FAILED"]));
  });
});

describe("acceptance 2: expired XAI", () => {
  const xai = { mint: "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx", retired: XAI_EVIDENCE, catalog: ok({ listed: false, retrievedAt: NOW }) };

  it("holds with the issuer window first and catalog absence second, with no wallet involved", () => {
    const r = runCheck(preview(xai));
    expect(r.status).toBe("HOLD");
    expect(r.signAvailable).toBe(false);
    expect(r.reasons.map((x) => x.code)).toEqual(["ISSUER_WINDOW_CLOSED", "NOT_IN_CURRENT_CATALOG"]);
    expect(r.reasons[0].evidence).toMatchObject({ issuerUrl: XAI_EVIDENCE.issuerUrl, sha256: XAI_EVIDENCE.sha256 });
    expect(r.reasons[0].message).toContain("conversion window closed");
  });

  it("still holds even if a route and simulation would succeed", () => {
    expect(runCheck(final(xai))).toMatchObject({ status: "HOLD", signAvailable: false });
  });
});

describe("acceptance 3: SPACEX future deadline plus other warnings", () => {
  const spacex = final({
    mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
    deadlineAhead: SPACEX_EVIDENCE,
    issuer: verified(),
    catalog: ok({ listed: true, symbol: "SPACEX", markPrice: 80, retrievedAt: NOW, mintForLifecycleSymbol: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh" }),
    mintState: ok({ paused: false, decimals: 9, multiplier: 5, feeBps: 100 }),
    destAccount: ok({ exists: false, frozen: false }),
    quote: ok({ hasRoute: true, sizeImpactPct: 3.5, usdcInRaw: 5_000_000n, netOutRaw: 8_672_375n }),
    simulation: ok({ succeeded: true, creditRaw: 8_672_375n, walletSolCostLamports: 1_626_668 }),
  });

  it("discloses every triggered reason, deadline first, and stays signable after acknowledgement", () => {
    const r = runCheck(spacex);
    expect(r.status).toBe("DISCLOSE");
    expect(r.signAvailable).toBe(true);
    expect(r.reasons.map((x) => x.code)).toEqual(["ISSUER_DEADLINE", "ABOVE_MARK", "THIN_ROUTE", "HIGH_NETWORK_COST"]);
  });

  it("quotes the issuer's conversion terms accurately", () => {
    const deadline = runCheck(spacex).reasons[0];
    expect(deadline.message).toContain("$SPCXx or any other token");
    expect(deadline.evidence).toMatchObject({ deadline: SPACEX_EVIDENCE.deadline, sha256: SPACEX_EVIDENCE.sha256, liveVerifiedAt: NOW });
  });

  it("explains that the SOL cost is mostly refundable rent when the token account is new", () => {
    const cost = runCheck(spacex).reasons.find((x) => x.code === "HIGH_NETWORK_COST")!;
    expect(cost.message).toContain("rent to open your token account");
  });
});

describe("acceptance 4: unknown, unavailable, paused, frozen", () => {
  it("holds an unknown mint", () => {
    expect(runCheck(final({ catalog: ok({ listed: false, retrievedAt: NOW }) }))).toMatchObject({
      status: "HOLD",
      signAvailable: false,
      reasons: [expect.objectContaining({ code: "NOT_IN_CURRENT_CATALOG" })],
    });
  });

  it("holds when the catalog is unavailable and never invents a premium", () => {
    const r = runCheck(final({ catalog: fail("timeout") }));
    expect(r.status).toBe("HOLD");
    expect(r.signAvailable).toBe(false);
    expect(r.reasons[0]).toMatchObject({ code: "SOURCE_UNAVAILABLE", evidence: { source: "catalog" } });
    expect(r.notEvaluated).toEqual(expect.arrayContaining(["catalog", "ABOVE_MARK"]));
    expect(r.metrics.premiumPct).toBeUndefined();
  });

  it("holds when mint state cannot be read", () => {
    const r = runCheck(final({ mintState: fail("429") }));
    expect(r.reasons[0]).toMatchObject({ code: "SOURCE_UNAVAILABLE", evidence: { source: "rpc" } });
    expect(r.notEvaluated).toContain("MINT_PAUSED");
    expect(r.signAvailable).toBe(false);
  });

  it("holds when the destination account cannot be read", () => {
    expect(runCheck(final({ destAccount: fail("rpc down") })).reasons[0]).toMatchObject({ code: "SOURCE_UNAVAILABLE", evidence: { source: "rpc" } });
  });

  it("holds when the quote fails", () => {
    const r = runCheck(final({ quote: fail("Jupiter /order 500") }));
    expect(r.reasons[0]).toMatchObject({ code: "SOURCE_UNAVAILABLE", evidence: { source: "jupiter" } });
    expect(r.notEvaluated).toEqual(expect.arrayContaining(["ABOVE_MARK", "THIN_ROUTE"]));
  });

  it("holds when simulation cannot run", () => {
    expect(runCheck(final({ simulation: fail("rpc down") }))).toMatchObject({ status: "HOLD", signAvailable: false });
  });

  it("holds when no route exists", () => {
    expect(codes(final({ quote: ok({ hasRoute: false, sizeImpactPct: null, usdcInRaw: 2_000_000n, netOutRaw: 0n }) }))).toContain(
      "NO_EXECUTABLE_ROUTE",
    );
  });

  it("holds when the transaction would fail on chain", () => {
    const r = runCheck(final({ simulation: ok({ succeeded: false, creditRaw: 0n, walletSolCostLamports: 0, error: "Custom 6001" }) }));
    expect(r.reasons[0]).toMatchObject({ code: "SIMULATION_FAILED", status: "HOLD" });
  });

  it("holds a paused mint", () => {
    expect(codes(final({ mintState: ok({ paused: true, decimals: 9, multiplier: 1, feeBps: 100 }) }))).toEqual(["MINT_PAUSED"]);
  });

  it("does not hold a mint without the pausable extension (a freeze authority alone is not a pause)", () => {
    expect(runCheck(final({ mintState: ok({ paused: null, decimals: 9, multiplier: 1, feeBps: 100 }) })).status).toBe("CLEAR");
  });

  it("holds a frozen destination account, but not a frozen flag on an account that does not exist", () => {
    expect(codes(final({ destAccount: ok({ exists: true, frozen: true }) }))).toEqual(["DEST_ACCOUNT_FROZEN"]);
    expect(codes(final({ destAccount: ok({ exists: false, frozen: true }) }))).toEqual([]);
  });

  it("gives each failure a distinct, non-signing result", () => {
    const failures = [
      final({ catalog: ok({ listed: false, retrievedAt: NOW }) }),
      final({ catalog: fail("x") }),
      final({ mintState: fail("x") }),
      final({ quote: fail("x") }),
      final({ mintState: ok({ paused: true, decimals: 9, multiplier: 1, feeBps: 100 }) }),
      final({ destAccount: ok({ exists: true, frozen: true }) }),
    ].map(runCheck);
    for (const r of failures) expect(r).toMatchObject({ status: "HOLD", signAvailable: false });
    const firstReasons = failures.map((r) => `${r.reasons[0].code}:${String(r.reasons[0].evidence?.source ?? "")}`);
    expect(new Set(firstReasons).size).toBe(failures.length);
  });
});

describe("thresholds", () => {
  const price = 2 / 0.001897345;

  it("discloses ABOVE_MARK above 5% and not at 4.99%", () => {
    const at = (pct: number) => codes(final({ catalog: ok({ listed: true, markPrice: price / (1 + pct / 100), retrievedAt: NOW }) }));
    expect(at(4.99)).not.toContain("ABOVE_MARK");
    expect(at(5.01)).toContain("ABOVE_MARK");
  });

  it("does not warn when the price is below the mark", () => {
    expect(codes(final({ catalog: ok({ listed: true, markPrice: price * 1.3, retrievedAt: NOW }) }))).toEqual([]);
  });

  it("discloses THIN_ROUTE above 3% size impact and not at 2.99%", () => {
    const at = (pct: number) => codes(final({ quote: ok({ hasRoute: true, sizeImpactPct: pct, usdcInRaw: 2_000_000n, netOutRaw: 1_897_345n }) }));
    expect(at(2.99)).not.toContain("THIN_ROUTE");
    expect(at(3.01)).toContain("THIN_ROUTE");
    expect(at(-5)).not.toContain("THIN_ROUTE");
  });

  it("marks THIN_ROUTE not evaluated when size impact could not be measured", () => {
    const r = runCheck(final({ quote: ok({ hasRoute: true, sizeImpactPct: null, usdcInRaw: 2_000_000n, netOutRaw: 1_897_345n }) }));
    expect(r.notEvaluated).toEqual(["THIN_ROUTE"]);
  });

  it("discloses HIGH_NETWORK_COST above the lamport cap and not at it", () => {
    const at = (lamports: number) => codes(final({ simulation: ok({ succeeded: true, creditRaw: 1n, walletSolCostLamports: lamports }), policy: { maxSolCostLamports: 50_000, maxSolCostPctOfOrder: 100, solUsd: null } }));
    expect(at(50_000)).not.toContain("HIGH_NETWORK_COST");
    expect(at(50_001)).toContain("HIGH_NETWORK_COST");
  });

  it("discloses HIGH_NETWORK_COST when the SOL cost exceeds 0.5% of the order in dollars", () => {
    // $2 order at $400/SOL: 0.5% is $0.01, i.e. 25,000 lamports.
    const at = (lamports: number) => codes(final({ simulation: ok({ succeeded: true, creditRaw: 1n, walletSolCostLamports: lamports }), policy: { maxSolCostLamports: 50_000, maxSolCostPctOfOrder: 0.5, solUsd: 400 } }));
    expect(at(25_000)).not.toContain("HIGH_NETWORK_COST");
    expect(at(25_001)).toContain("HIGH_NETWORK_COST");
  });

  it("marks HIGH_NETWORK_COST not evaluated when no cost policy was supplied", () => {
    expect(runCheck(final({ policy: undefined })).notEvaluated).toContain("HIGH_NETWORK_COST");
  });
});

describe("acceptance 5: fee and amount math", () => {
  it("reproduces the gate transaction fee with Token-2022's own formula", () => {
    const fee = calculateFee({ epoch: 0n, maximumFee: 2n ** 64n - 1n, transferFeeBasisPoints: 100 }, 4_864_752n);
    expect(fee).toBe(48_648n);
    expect(4_864_752n - fee).toBe(4_816_104n);
  });

  it("prices from the net credit without subtracting the fee a second time", () => {
    const gate = final({ quote: ok({ hasRoute: true, sizeImpactPct: 0, usdcInRaw: 5_000_000n, netOutRaw: 4_816_104n }) });
    expect(priceOf(gate)).toBe(5 / (4_816_104 / 1e9));
  });

  it("applies a non-unit scaled-UI multiplier to the credited amount", () => {
    const spacex = final({
      mintState: ok({ paused: false, decimals: 9, multiplier: 5, feeBps: 100 }),
      quote: ok({ hasRoute: true, sizeImpactPct: 0, usdcInRaw: 5_000_000n, netOutRaw: 8_672_375n }),
    });
    expect(runCheck(spacex).metrics.netOutUi).toBeCloseTo(0.043361875, 12);
    expect(priceOf(spacex)).toBeCloseTo(5 / 0.043361875, 9);
  });

  it("switches to the newer transfer fee only once its epoch is reached", () => {
    const config = {
      olderTransferFee: { epoch: 800, maximumFee: "1000000", transferFeeBasisPoints: 100 },
      newerTransferFee: { epoch: 900, maximumFee: "500000", transferFeeBasisPoints: 50 },
    };
    expect(activeFee(config, 899)).toEqual({ bps: 100, maxFeeRaw: 1_000_000n, epoch: 800 });
    expect(activeFee(config, 900)).toEqual({ bps: 50, maxFeeRaw: 500_000n, epoch: 900 });
  });

  it("switches to the new multiplier only once its effective time has passed", () => {
    const config = { multiplier: "1.4861347", newMultiplier: "2", newMultiplierEffectiveTimestamp: "1790000000" };
    expect(effectiveMultiplier(config, 1_789_999_999)).toBe(1.4861347);
    expect(effectiveMultiplier(config, 1_790_000_000)).toBe(2);
    expect(effectiveMultiplier({ multiplier: "5", newMultiplier: "5", newMultiplierEffectiveTimestamp: "0" }, 1_790_000_000)).toBe(5);
  });
});

describe("acceptance 6: issuer evidence integrity and freshness", () => {
  const spacex = (over: Partial<CheckInput>) =>
    final({ mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", deadlineAhead: SPACEX_EVIDENCE, issuer: verified(), ...over });

  it("does not offer signing for a lifecycle mint whose issuer evidence was not checked", () => {
    const r = runCheck(spacex({ issuer: undefined }));
    expect(r.notEvaluated).toContain("EVIDENCE_CONFLICT");
    expect(r.signAvailable).toBe(false);
  });

  it("holds when the issuer page cannot be fetched", () => {
    const r = runCheck(spacex({ issuer: fail("HTTP 503") }));
    expect(r.reasons[0]).toMatchObject({ code: "SOURCE_UNAVAILABLE", evidence: { source: "issuer" } });
    expect(r.signAvailable).toBe(false);
  });

  it("holds when the issuer evidence is older than 24 hours", () => {
    const stale = new Date(Date.parse(NOW) - 24 * 60 * 60_000 - 1).toISOString();
    expect(runCheck(spacex({ issuer: verified({ fetchedAt: stale }) })).reasons[0]).toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    const fresh = new Date(Date.parse(NOW) - 24 * 60 * 60_000).toISOString();
    expect(codes(spacex({ issuer: verified({ fetchedAt: fresh }) }))).not.toContain("SOURCE_UNAVAILABLE");
  });

  it.each([
    ["a tampered capture", { captureIntact: false }, "SHA-256"],
    ["an issuer page that no longer links the mint", { mintLinked: false, linkedMints: ["Other111"] }, "no longer links this mint"],
    ["changed lifecycle terms", { statementPresent: false }, "lifecycle terms"],
  ])("holds with EVIDENCE_CONFLICT for %s", (_label, over, text) => {
    const r = runCheck(spacex({ issuer: verified(over) }));
    expect(r.status).toBe("HOLD");
    expect(r.signAvailable).toBe(false);
    expect(r.reasons[0].code).toBe("EVIDENCE_CONFLICT");
    expect(r.reasons[0].message).toContain(text);
  });

  it("holds when the catalog lists the lifecycle symbol under a different mint", () => {
    const catalog = ok({ listed: true, markPrice: 1038.61, retrievedAt: NOW, mintForLifecycleSymbol: "PreOtherMint1111111111111111111111111111111" });
    expect(runCheck(spacex({ catalog })).reasons[0]).toMatchObject({ code: "EVIDENCE_CONFLICT" });
  });

  it("reports every conflict in one reason", () => {
    const r = runCheck(spacex({ issuer: verified({ captureIntact: false, statementPresent: false }) }));
    expect(r.reasons.filter((x) => x.code === "EVIDENCE_CONFLICT")).toHaveLength(1);
    expect(r.reasons[0].message).toMatch(/SHA-256.*lifecycle terms/);
  });

  it("does not claim live verification when the evidence conflicts", () => {
    const deadline = runCheck(spacex({ issuer: verified({ statementPresent: false }) })).reasons.find((x) => x.code === "ISSUER_DEADLINE")!;
    expect(deadline.evidence?.liveVerifiedAt).toBeNull();
  });

  it("ignores issuer evidence for mints without a lifecycle entry", () => {
    expect(runCheck(final({ issuer: undefined })).status).toBe("CLEAR");
  });
});

describe("ordering", () => {
  it("lists HOLD reasons before DISCLOSE reasons", () => {
    const r = runCheck(final({ deadlineAhead: SPACEX_EVIDENCE, destAccount: ok({ exists: true, frozen: true }) }));
    expect(r.reasons.map((x) => x.status)).toEqual(["HOLD", "DISCLOSE"]);
  });
});
