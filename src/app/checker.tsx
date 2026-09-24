"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import type { CheckResult } from "@/lib/check";
import { fmtSol, fmtTokens, tokensUi } from "@/lib/format";
import { CatalogTable, type CatalogView } from "./catalog-table";
import { NotChecked, ReasonList, signedPct, StatusBadge, utc } from "./ui";

const XAI = "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx";

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

const button = "rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-40";

export default function Checker({ catalog, initialMint }: { catalog: CatalogView | null; initialMint?: string }) {
  const { publicKey, signTransaction } = useWallet();
  const [mint, setMint] = useState(initialMint ?? XAI);
  const [usdc, setUsdc] = useState("2");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [order, setOrder] = useState<(Order & { deadline: number }) | null>(null);
  const [heldOrder, setHeldOrder] = useState<CheckResult | null>(null);
  const [acked, setAcked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(order?.deadline);

  useEffect(() => {
    const restore = setTimeout(() => setPending(readPending()), 0);
    return () => clearTimeout(restore);
  }, []);

  const checkInitialMint = useEffectEvent(() => {
    if (initialMint) void runPreview(initialMint);
  });

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
    clearOrder();
    setError(null);
    setSignature(null);
  }

  function dismissPending() {
    writePending(null);
    setPending(null);
  }

  async function runPreview(target = mint) {
    reset();
    setBusy("Checking");
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
  const previewBadge = preview && preview.status === "CLEAR" ? "PREVIEW" : preview?.status;
  const ui = (raw: string) => (order ? fmtTokens(tokensUi(raw, order.expected.decimals, order.expected.multiplier)) : "");

  return (
    <div className="space-y-8">
      {catalog ? (
        <CatalogTable catalog={catalog} selected={mint} onPick={pick} />
      ) : (
        <p className="text-sm opacity-70">The PreStocks catalog could not be read just now. You can still check a mint by address.</p>
      )}

      <section className="space-y-3">
        <label className="block text-sm font-semibold" htmlFor="mint">
          Or check any mint address
        </label>
        <div className="flex gap-2">
          <input
            id="mint"
            value={mint}
            onChange={(e) => {
              setMint(e.target.value);
              reset();
            }}
            className="min-w-0 flex-1 rounded border border-current/20 bg-transparent px-3 py-2 font-mono text-sm"
            spellCheck={false}
          />
          <button onClick={() => runPreview()} disabled={!!busy} className={button}>
            Check
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="py-1 opacity-60">Try:</span>
          {OFF_CATALOG_EXAMPLES.map((ex) => (
            <button key={ex.mint} onClick={() => pick(ex.mint)} className="rounded border border-current/20 px-2 py-1 opacity-80 hover:opacity-100">
              {ex.label}
            </button>
          ))}
        </div>
      </section>

      {busy && <p className="text-sm opacity-70">{busy}…</p>}
      {error && <p className="rounded border border-red-600/50 p-3 text-sm text-red-600">{error}</p>}

      {preview && previewBadge && (
        <section className="space-y-3 rounded border border-current/15 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={previewBadge} />
            <span className="font-semibold">{preview.symbol ?? "Unlisted mint"}</span>
            <span className="font-mono text-xs opacity-50">{preview.mint}</span>
          </div>
          <ReasonList reasons={preview.reasons} empty="No warning in the checks that run without a wallet." />
          {preview.status !== "HOLD" && <NotChecked codes={preview.notEvaluated} />}
          <p className="text-xs opacity-50">Checked at {utc(preview.checkedAt)}, without a wallet. Nothing can be signed from this preview.</p>
        </section>
      )}

      {preview && preview.status !== "HOLD" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-semibold" htmlFor="usdc">
                Amount in USDC
              </label>
              <input
                id="usdc"
                type="number"
                min="0.5"
                max="5"
                step="0.5"
                value={usdc}
                onChange={(e) => {
                  setUsdc(e.target.value);
                  clearOrder();
                }}
                className="w-28 rounded border border-current/20 bg-transparent px-3 py-2 font-mono text-sm"
              />
            </div>
            <WalletMultiButton />
            <button onClick={prepareOrder} disabled={!publicKey || !!busy || !!signature || !!pending} className={button}>
              Prepare order
            </button>
          </div>
          <p className="text-xs opacity-50">Orders are capped at 5 USDC while Preflight is a hackathon build.</p>
        </section>
      )}

      {heldOrder && (
        <section className="space-y-3 rounded border border-red-600/40 p-4">
          <div className="flex items-center gap-3">
            <StatusBadge status="HOLD" />
            <span className="text-sm">No transaction was built for you to sign.</span>
          </div>
          <ReasonList reasons={heldOrder.reasons} empty="" />
        </section>
      )}

      {order && (
        <section className="space-y-4 rounded border border-current/15 p-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={order.check.status} />
            <span className="font-semibold">
              {Number(order.usdcInRaw) / 1e6} USDC → {order.symbol}
            </span>
            <span className={`ml-auto font-mono text-sm ${secondsLeft < 10 ? "text-red-600" : "opacity-70"}`}>
              {secondsLeft > 0 ? `expires in ${secondsLeft}s` : "expired"}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="opacity-70">You receive (simulated)</dt>
            <dd className="font-mono">
              {ui(order.expected.netOutRaw)} {order.symbol}
            </dd>
            <dt className="opacity-70">Minimum if the swap succeeds</dt>
            <dd className="font-mono">
              {ui(order.expected.minOutRaw)} {order.symbol}
              {order.check.metrics.worstPremiumPct !== undefined &&
                ` (up to $${order.check.metrics.worstPrice?.toFixed(2)}, ${signedPct(order.check.metrics.worstPremiumPct, 2)} vs mark)`}
            </dd>
            <dt className="opacity-70">Price per token</dt>
            <dd className="font-mono">
              ${order.check.metrics.executablePrice?.toFixed(2)}
              {order.check.metrics.premiumPct !== undefined && ` (${signedPct(order.check.metrics.premiumPct, 2)} vs mark)`}
            </dd>
            {order.mark.price !== null && order.mark.retrievedAt && (
              <>
                <dt className="opacity-70">Issuer mark</dt>
                <dd className="font-mono">
                  ${order.mark.price.toFixed(2)} <span className="opacity-60">read {utc(order.mark.retrievedAt)}</span>
                </dd>
              </>
            )}
            {order.expected.feeBps !== null && (
              <>
                <dt className="opacity-70">Token transfer fee</dt>
                <dd className="font-mono">
                  {(order.expected.feeBps / 100).toFixed(2)}% <span className="opacity-60">read on chain, already deducted above</span>
                </dd>
              </>
            )}
            {order.expected.multiplier !== 1 && (
              <>
                <dt className="opacity-70">Display multiplier</dt>
                <dd className="font-mono">
                  ×{order.expected.multiplier} <span className="opacity-60">Token-2022 scaled UI amount</span>
                </dd>
              </>
            )}
            <dt className="opacity-70">Wallet SOL cost</dt>
            <dd className="font-mono">{fmtSol(order.expected.walletSolCostLamports)}</dd>
            <dt className="opacity-70">Route</dt>
            <dd className="font-mono">Jupiter ({order.router})</dd>
          </dl>
          <p className="text-xs opacity-60">Below the minimum the swap reverts and you keep your USDC, but the network fee is still charged.</p>
          <ReasonList reasons={order.check.reasons} empty="No configured warning triggered at this size and time." />
          <NotChecked codes={order.check.notEvaluated} />
          {disclosures.length > 0 && (
            <div className="space-y-2">
              {disclosures.map((r, i) => (
                <label key={`${r.code}-${i}`} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={acked.includes(r.code)}
                    onChange={(e) => setAcked(e.target.checked ? [...acked, r.code] : acked.filter((c) => c !== r.code))}
                    className="mt-1"
                  />
                  <span>
                    I understand <span className="font-mono">{r.code}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="rounded border border-current/15 p-3 text-xs opacity-80">
            PreStocks says its tokens &ldquo;confer no ownership, voting, dividend, information, or other legal rights&rdquo; and &ldquo;are not
            available in the U.S., to U.S. persons, or to other ineligible persons.&rdquo; Preflight does not determine your eligibility.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={signAndSubmit} disabled={!canSign} className={button}>
              Sign and buy
            </button>
            {secondsLeft === 0 && !signature && !pending && (
              <button onClick={prepareOrder} className="text-sm underline">
                Prepare a fresh order
              </button>
            )}
          </div>
          <p className="font-mono text-xs opacity-50">verdict {order.verdictHash.slice(0, 16)}…</p>
        </section>
      )}

      {pending && (
        <section className={`space-y-2 rounded border p-4 text-sm ${signature === pending && !error ? "border-emerald-600/50" : "border-amber-500/60"}`}>
          <p>
            {signature === pending && !error ? "Submitted." : "You signed a purchase. Check its receipt before buying again."}{" "}
            <Link href={`/r/${pending}`} className="font-mono underline">
              View receipt
            </Link>
          </p>
          <button onClick={dismissPending} className="text-xs underline opacity-70">
            I have checked the receipt
          </button>
        </section>
      )}
    </div>
  );
}
