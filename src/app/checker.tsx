"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CheckResult } from "@/lib/check";
import { fmtDate, fmtSol, fmtTokens, fmtUsd, tokensUi } from "@/lib/format";
import type { MarketSnapshot, TokenDetail } from "@/lib/market";
import { Bezel } from "./_site/primitives";
import { CatalogTable, type CatalogView, type LiveQuote } from "./catalog-table";
import { TokenDetailView } from "./token-detail";
import { NotChecked, ReasonList, signedPct, StatusLight } from "./ui";

const XAI = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";
const LIVE_REFRESH_MS = 15_000;

const OFF_CATALOG_EXAMPLES = [
  { label: "Paused v1 OPENAI mint", mint: "PreYKD2kJ5xGgoZ644VPfbEN7sW8bWCUREHr5S3ebV9" },
  { label: "A mint not in the catalog", mint: "6yWNSP6qqhob2WqjBmNb1RuVsBK17RM3SqTYAXYz8KPr" },
];

type Preview = CheckResult & { mint: string; symbol: string | null; checkedAt: string };

type Order = {
  orderId: string;
  expiresInMs: number;
  symbol?: string;
  usdcInRaw: string;
  check: CheckResult;
  verdictHash: string;
  mark: { price: number | null; retrievedAt: string | null };
  expected: { netOutRaw: string; minOutRaw: string; walletSolCostLamports: number; decimals: number; multiplier: number; feeBps: number | null };
  transaction: string;
  router: string;
};

// Submit answers that guarantee nothing reached Jupiter, so the purchase lock can be released.
const NOT_SENT = new Set(["ORDER_NOT_FOUND", "ORDER_EXPIRED", "NOT_ACKNOWLEDGED", "INVALID_TRANSACTION", "MESSAGE_CHANGED", "BAD_SIGNATURE", "NOT_SENT", "BAD_REQUEST"]);

// Survives a reload, so a signed purchase whose outcome is unknown is never forgotten.
const PENDING_KEY = "preflight:signed";

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(signature: string | null) {
  try {
    if (signature) sessionStorage.setItem(PENDING_KEY, signature);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));

function useSecondsLeft(deadline: number | undefined): number {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const update = () => setSecondsLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    const first = setTimeout(update, 0);
    const id = setInterval(update, 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [deadline]);
  return deadline ? secondsLeft : 0;
}

function useLiveQuotes(): { quotes: Record<string, LiveQuote>; at: string | null } {
  const [state, setState] = useState<{ quotes: Record<string, LiveQuote>; at: string | null }>({ quotes: {}, at: null });
  const previous = useRef<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/market");
        if (!res.ok) return;
        const snapshot = (await res.json()) as MarketSnapshot;
        if (cancelled) return;
        const quotes: Record<string, LiveQuote> = {};
        for (const q of snapshot.quotes) {
          if (q.priceUsd === null) continue;
          const before = previous.current[q.mint];
          quotes[q.mint] = { price: q.priceUsd, move: before === undefined || before === q.priceUsd ? null : q.priceUsd > before ? "up" : "down" };
          previous.current[q.mint] = q.priceUsd;
        }
        setState({ quotes, at: snapshot.at });
      } catch {}
    }
    const first = setTimeout(load, 0);
    const id = setInterval(load, LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return state;
}

const pill = "rounded-full px-5 py-2.5 text-sm font-semibold transition-transform duration-500 ease-spring active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";
const primary = `${pill} bg-foreground text-background`;
const quiet = `${pill} bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/[0.09]`;
const field = "rounded-full bg-raised px-4 py-2.5 font-mono text-sm ring-1 ring-white/[0.08] outline-none transition-shadow focus:ring-white/25";

export default function Checker({ catalog, initialMint }: { catalog: CatalogView | null; initialMint?: string }) {
  const { publicKey, signTransaction } = useWallet();
  const [mint, setMint] = useState(initialMint ?? XAI);
  const [usdc, setUsdc] = useState("2");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [detail, setDetail] = useState<TokenDetail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const selected = useRef(initialMint ?? XAI);
  const [order, setOrder] = useState<(Order & { deadline: number }) | null>(null);
  const [heldOrder, setHeldOrder] = useState<CheckResult | null>(null);
  const [acked, setAcked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(order?.deadline);
  const live = useLiveQuotes();

  useEffect(() => {
    const restore = setTimeout(() => setPending(readPending()), 0);
    return () => clearTimeout(restore);
  }, []);

  const checkInitialMint = useEffectEvent(() => void runPreview(initialMint ?? XAI));

  useEffect(() => {
    const start = setTimeout(checkInitialMint, 0);
    return () => clearTimeout(start);
  }, []);

  function clearOrder() {
    setOrder(null);
    setHeldOrder(null);
    setAcked([]);
  }

  function reset() {
    setPreview(null);
    setDetail(null);
    setDetailFailed(false);
    clearOrder();
    setError(null);
    setSignature(null);
  }

  function dismissPending() {
    writePending(null);
    setPending(null);
  }

  function loadDetail(target: string) {
    setDetailFailed(false);
    fetch(`/api/token/${encodeURIComponent(target)}`)
      .then((r) => (r.ok ? (r.json() as Promise<TokenDetail>) : Promise.reject()))
      .then((d) => {
        if (selected.current === target) setDetail(d);
      })
      .catch(() => {
        if (selected.current === target) setDetailFailed(true);
      });
  }

  async function runPreview(target = mint) {
    reset();
    setBusy("Checking");
    selected.current = target.trim();
    if (catalog?.tokens.some((t) => t.mint === target.trim())) loadDetail(target.trim());
    try {
      const res = await fetch(`/api/check?mint=${encodeURIComponent(target.trim())}`);
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Check failed.");
      else setPreview(body);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  function pick(target: string) {
    setMint(target);
    void runPreview(target);
  }

  async function prepareOrder() {
    if (!publicKey) return;
    clearOrder();
    setError(null);
    setBusy("Quoting and simulating");
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint: mint.trim(), wallet: publicKey.toBase58(), usdc: Number(usdc) }),
      });
      const body = await res.json();
      if (body.ok) setOrder({ ...body.order, deadline: Date.now() + body.order.expiresInMs });
      else if (body.check) setHeldOrder(body.check);
      else setError(body.error ?? "Order failed.");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function signAndSubmit() {
    if (!order || !signTransaction) return;
    setError(null);
    setBusy("Waiting for wallet");
    try {
      const tx = VersionedTransaction.deserialize(fromBase64(order.transaction));
      const signed = await signTransaction(tx);
      const signedSignature = bs58.encode(signed.signatures[0]);
      setSignature(signedSignature);
      writePending(signedSignature);
      setPending(signedSignature);
      setBusy("Submitting");
      try {
        const res = await fetch("/api/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: order.orderId, signedTransaction: toBase64(signed.serialize()), ackedReasons: acked }),
        });
        const body = await res.json();
        if (!body.ok) setError(`${body.code}: ${body.error}`);
        if (!body.ok && NOT_SENT.has(body.code)) {
          setSignature(null);
          dismissPending();
        }
      } catch {
        setError("OUTCOME_UNKNOWN: Preflight did not hear back after sending. The purchase may still land. Do not buy again; open the receipt.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing was cancelled.");
    } finally {
      setBusy(null);
    }
  }

  const disclosures = order?.check.reasons.filter((r) => r.status === "DISCLOSE") ?? [];
  const allAcked = disclosures.every((r) => acked.includes(r.code));
  const canSign = !!order && secondsLeft > 0 && allAcked && !busy && !signature && !pending;
  const previewStatus = preview && preview.status === "CLEAR" ? "PREVIEW" : preview?.status;
  const tokens = (raw: string) => (order ? fmtTokens(tokensUi(raw, order.expected.decimals, order.expected.multiplier)) : "");
  const windowMs = order ? order.expiresInMs : 1;
  const unlisted = preview && !detail && !catalog?.tokens.some((t) => t.mint === preview.mint);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.05fr]">
      <div className="space-y-6">
        <Bezel inner="p-3">
          {catalog ? (
            <CatalogTable catalog={catalog} selected={mint} onPick={pick} live={live.quotes} liveAt={live.at} />
          ) : (
            <p className="p-4 text-sm text-muted">The PreStocks catalog could not be read just now. You can still check a mint by address.</p>
          )}
          <div className="mt-3 space-y-3 border-t border-white/[0.06] px-3 pt-4 pb-2">
            <div className="flex gap-2">
              <input
                id="mint"
                aria-label="Mint address"
                placeholder="Paste any mint address"
                value={mint}
                onChange={(e) => {
                  setMint(e.target.value);
                  reset();
                }}
                className={`${field} min-w-0 flex-1 text-[12px]`}
                spellCheck={false}
              />
              <button onClick={() => runPreview()} disabled={!!busy} className={quiet}>
                Check
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {OFF_CATALOG_EXAMPLES.map((ex) => (
                <button key={ex.mint} onClick={() => pick(ex.mint)} className="rounded-full bg-white/[0.04] px-3 py-1 text-[11px] text-muted ring-1 ring-white/[0.07] hover:text-foreground">
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </Bezel>

        <Bezel inner="space-y-5 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase">Preflight verdict</p>
              {unlisted && <p className="mt-1 font-display text-2xl tracking-tight">{preview?.symbol ?? "Unlisted mint"}</p>}
            </div>
            {busy ? (
              <span className="flex items-center gap-2 font-mono text-xs text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-muted" />
                {busy}
              </span>
            ) : (
              previewStatus && !order && !heldOrder && <StatusLight status={previewStatus} />
            )}
          </div>

          {error && <p className="rounded-xl bg-hold/[0.08] px-4 py-3 text-sm text-hold ring-1 ring-hold/25">{error}</p>}

          {preview && !order && !heldOrder && (
            <>
              <ReasonList reasons={preview.reasons} empty="No warning in the checks that run without a wallet." />
              {preview.status !== "HOLD" && <NotChecked codes={preview.notEvaluated} />}
              <p className="text-[11px] text-muted">Checked {fmtDate(preview.checkedAt, true)} without a wallet. Nothing can be signed from a preview.</p>
            </>
          )}

          {preview && preview.status !== "HOLD" && !order && (
            <div className="space-y-3 border-t border-white/[0.06] pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-full bg-raised ring-1 ring-white/[0.08] focus-within:ring-white/25">
                  <input
                    id="usdc"
                    aria-label="Amount in USDC"
                    type="number"
                    min="0.5"
                    max="5"
                    step="0.5"
                    value={usdc}
                    onChange={(e) => {
                      setUsdc(e.target.value);
                      clearOrder();
                    }}
                    className="w-20 bg-transparent py-2.5 pl-4 font-mono text-sm outline-none"
                  />
                  <span className="pr-4 font-mono text-xs text-muted">USDC</span>
                </div>
                <button onClick={prepareOrder} disabled={!publicKey || !!busy || !!signature || !!pending} className={`${primary} flex-1`}>
                  {publicKey ? "Prepare order" : "Connect a wallet to buy"}
                </button>
              </div>
              <p className="text-[11px] text-muted">Orders are capped at 5 USDC while Preflight is a hackathon build. Buying re-checks everything for your wallet and amount.</p>
            </div>
          )}

          {heldOrder && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">No transaction was built for you to sign.</p>
                <StatusLight status="HOLD" />
              </div>
              <ReasonList reasons={heldOrder.reasons} empty="" />
            </>
          )}

          {order && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-display text-2xl tracking-tight">
                    {Number(order.usdcInRaw) / 1e6} USDC → {order.symbol}
                  </p>
                  <StatusLight status={order.check.status} />
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full transition-[width] duration-500 ease-linear ${secondsLeft < 10 ? "bg-hold" : "bg-disclose"}`}
                    style={{ width: `${Math.min(100, ((secondsLeft * 1000) / windowMs) * 100)}%` }}
                  />
                </div>
                <p className={`tabular font-mono text-[11px] ${secondsLeft < 10 ? "text-hold" : "text-muted"}`}>
                  {secondsLeft > 0 ? `Route valid for ${secondsLeft}s` : "Route expired"}
                </p>
              </div>

              <dl className="divide-y divide-white/[0.06] rounded-2xl bg-raised px-4 ring-1 ring-white/[0.05]">
                {(
                  [
                    ["You receive (simulated)", `${tokens(order.expected.netOutRaw)} ${order.symbol}`],
                    [
                      "Minimum if the swap succeeds",
                      `${tokens(order.expected.minOutRaw)}${order.check.metrics.worstPrice !== undefined ? ` · up to ${fmtUsd(order.check.metrics.worstPrice)}` : ""}`,
                    ],
                    [
                      "Price per token",
                      `${order.check.metrics.executablePrice !== undefined ? fmtUsd(order.check.metrics.executablePrice) : "—"}${order.check.metrics.premiumPct !== undefined ? ` · ${signedPct(order.check.metrics.premiumPct, 2)} vs mark` : ""}`,
                    ],
                    order.mark.price !== null && order.mark.retrievedAt ? ["Issuer mark", `${fmtUsd(order.mark.price)} · read ${fmtDate(order.mark.retrievedAt, true).split(", ")[1]}`] : null,
                    order.expected.feeBps !== null ? ["Token transfer fee", `${(order.expected.feeBps / 100).toFixed(2)}% · deducted above`] : null,
                    order.expected.multiplier !== 1 ? ["Display multiplier", `×${order.expected.multiplier}`] : null,
                    ["Wallet SOL cost", fmtSol(order.expected.walletSolCostLamports)],
                    ["Route", `Jupiter · ${order.router}`],
                  ].filter(Boolean) as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-[13px] text-muted">{label}</dt>
                    <dd className="tabular text-right font-mono text-[13px]">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11px] text-muted">Below the minimum the swap reverts and you keep your USDC, but the network fee is still charged.</p>

              <ReasonList reasons={order.check.reasons} empty="No configured warning triggered at this size and time." />
              <NotChecked codes={order.check.notEvaluated} />

              {disclosures.length > 0 && (
                <div className="space-y-2">
                  {disclosures.map((r, i) => {
                    const on = acked.includes(r.code);
                    return (
                      <button
                        key={`${r.code}-${i}`}
                        onClick={() => setAcked(on ? acked.filter((c) => c !== r.code) : [...acked, r.code])}
                        className={`flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left text-sm ring-1 transition-colors duration-300 ${
                          on ? "bg-disclose/[0.08] ring-disclose/40" : "bg-raised ring-white/[0.06] hover:ring-white/15"
                        }`}
                      >
                        <span>
                          I understand <span className="font-mono text-[12px]">{r.code}</span>
                        </span>
                        <span className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${on ? "bg-disclose" : "bg-white/10"}`}>
                          <span className={`h-4 w-4 rounded-full bg-background transition-transform duration-300 ease-spring ${on ? "translate-x-4" : ""}`} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="rounded-xl bg-raised px-4 py-3 text-xs leading-relaxed text-muted ring-1 ring-white/[0.05]">
                PreStocks says its tokens &ldquo;confer no ownership, voting, dividend, information, or other legal rights&rdquo; and &ldquo;are not available in the U.S., to U.S.
                persons, or to other ineligible persons.&rdquo; Preflight does not determine your eligibility.
              </p>

              <div className="flex items-center gap-3">
                <button onClick={signAndSubmit} disabled={!canSign} className={`${primary} flex-1`}>
                  Sign and buy
                </button>
                {secondsLeft === 0 && !signature && !pending && (
                  <button onClick={prepareOrder} className={quiet}>
                    Fresh order
                  </button>
                )}
              </div>
              <p className="font-mono text-[10px] text-muted">verdict {order.verdictHash.slice(0, 16)}…</p>
            </div>
          )}

          {pending && (
            <div className={`space-y-2 rounded-xl p-4 text-sm ring-1 ${signature === pending && !error ? "bg-clear/[0.06] ring-clear/30" : "bg-disclose/[0.06] ring-disclose/30"}`}>
              <p>
                {signature === pending && !error ? "Submitted." : "You signed a purchase. Check its receipt before buying again."}{" "}
                <Link href={`/r/${pending}`} className="font-mono underline">
                  View receipt
                </Link>
              </p>
              <button onClick={dismissPending} className="text-xs text-muted underline">
                I have checked the receipt
              </button>
            </div>
          )}
        </Bezel>
      </div>

      <div className="lg:sticky lg:top-24">
        {detail ? (
          <Bezel inner="p-6">
            <TokenDetailView detail={detail} livePrice={live.quotes[detail.mint]?.price ?? null} />
          </Bezel>
        ) : detailFailed ? (
          <Bezel inner="flex flex-col items-start gap-4 p-6">
            <p className="font-display text-3xl tracking-tight">Market data is catching up</p>
            <p className="text-sm text-muted">The on-chain market source did not answer in time. The Preflight verdict does not depend on it.</p>
            <button onClick={() => loadDetail(selected.current)} className={quiet}>
              Retry
            </button>
          </Bezel>
        ) : unlisted ? (
          <Bezel inner="space-y-3 p-6">
            <p className="font-display text-3xl tracking-tight">No market to show</p>
            <p className="text-sm leading-relaxed text-muted">
              This mint is not in the PreStocks catalog, so there is no issuer mark, company profile or listed market to compare against. Only the issuer&apos;s exact mints pass the gate.
            </p>
          </Bezel>
        ) : (
          <Bezel inner="space-y-4 p-6">
            <div className="h-8 w-40 animate-pulse rounded-full bg-white/[0.05]" />
            <div className="h-56 animate-pulse rounded-2xl bg-white/[0.03]" />
            <div className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" />
          </Bezel>
        )}
      </div>
    </div>
  );
}
