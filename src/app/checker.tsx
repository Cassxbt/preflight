"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CheckResult, Reason } from "@/lib/check";
import { fmtSol, fmtTokens, tokensUi } from "@/lib/format";

const EXAMPLES = [
  { label: "XAI (retired)", mint: "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx" },
  { label: "ANTHROPIC", mint: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw" },
  { label: "OPENAI", mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF" },
  { label: "SPACEX", mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh" },
  { label: "Outdated OPENAI", mint: "PreYKD2kJ5xGgoZ644VPfbEN7sW8bWCUREHr5S3ebV9" },
  { label: "Impostor", mint: "6yWNSP6qqhob2WqjBmNb1RuVsBK17RM3SqTYAXYz8KPr" },
];

type Preview = CheckResult & { mint: string; symbol: string | null; checkedAt: string };

type Order = {
  orderId: string;
  expiresAt: string;
  symbol?: string;
  usdcInRaw: string;
  check: CheckResult;
  verdictHash: string;
  expected: { netOutRaw: string; minOutRaw: string; walletSolCostLamports: number; decimals: number; multiplier: number };
  transaction: string;
  router: string;
};

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

const STATUS_STYLE: Record<string, string> = {
  CLEAR: "bg-emerald-600 text-white",
  DISCLOSE: "bg-amber-500 text-black",
  HOLD: "bg-red-600 text-white",
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 font-mono text-sm font-semibold ${STATUS_STYLE[status] ?? ""}`}>{status}</span>;
}

function Reasons({ reasons }: { reasons: Reason[] }) {
  if (!reasons.length) return <p className="text-sm opacity-70">No configured warning triggered at this size and time.</p>;
  return (
    <ul className="space-y-2">
      {reasons.map((r) => (
        <li key={r.code} className="text-sm">
          <StatusBadge status={r.status} /> <span className="font-mono font-semibold">{r.code}</span>
          <p className="mt-1 opacity-80">{r.message}</p>
        </li>
      ))}
    </ul>
  );
}

function useSecondsLeft(expiresAt: string | undefined): number {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setSecondsLeft(Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
    const first = setTimeout(update, 0);
    const id = setInterval(update, 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [expiresAt]);
  return expiresAt ? secondsLeft : 0;
}

export default function Checker() {
  const { publicKey, signTransaction } = useWallet();
  const [mint, setMint] = useState(EXAMPLES[0].mint);
  const [usdc, setUsdc] = useState("2");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [heldOrder, setHeldOrder] = useState<CheckResult | null>(null);
  const [acked, setAcked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(order?.expiresAt);

  useEffect(() => {
    const restore = setTimeout(() => setPending(readPending()), 0);
    return () => clearTimeout(restore);
  }, []);

  function reset() {
    setPreview(null);
    setOrder(null);
    setHeldOrder(null);
    setAcked([]);
    setError(null);
    setSignature(null);
  }

  function dismissPending() {
    writePending(null);
    setPending(null);
  }

  async function runPreview() {
    reset();
    setBusy("Checking");
    try {
      const res = await fetch(`/api/check?mint=${encodeURIComponent(mint.trim())}`);
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Check failed.");
      else setPreview(body);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function prepareOrder() {
    if (!publicKey) return;
    setOrder(null);
    setHeldOrder(null);
    setAcked([]);
    setError(null);
    setBusy("Quoting and simulating");
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint: mint.trim(), wallet: publicKey.toBase58(), usdc: Number(usdc) }),
      });
      const body = await res.json();
      if (body.ok) setOrder(body.order);
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

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <label className="block text-sm font-semibold" htmlFor="mint">
          Token mint address
        </label>
        <input
          id="mint"
          value={mint}
          onChange={(e) => {
            setMint(e.target.value);
            reset();
          }}
          className="w-full rounded border border-current/20 bg-transparent px-3 py-2 font-mono text-sm"
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.mint}
              onClick={() => {
                setMint(ex.mint);
                reset();
              }}
              className={`rounded border px-2 py-1 text-xs ${ex.mint === mint ? "border-current" : "border-current/20 opacity-70"}`}
            >
              {ex.label}
            </button>
          ))}
        </div>
        <button onClick={runPreview} disabled={!!busy} className="rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
          Check token
        </button>
      </section>

      {busy && <p className="text-sm opacity-70">{busy}…</p>}
      {error && <p className="rounded border border-red-600/50 p-3 text-sm text-red-600">{error}</p>}

      {preview && (
        <section className="space-y-3 rounded border border-current/15 p-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={preview.status} />
            <span className="font-semibold">{preview.symbol ?? "Unknown token"}</span>
            <span className="text-xs opacity-60">preview, checked {new Date(preview.checkedAt).toLocaleTimeString()}</span>
          </div>
          <Reasons reasons={preview.reasons} />
          {preview.status !== "HOLD" && (
            <p className="text-xs opacity-60">
              Preview covers issuer lifecycle, catalog listing and mint state. Price, route and cost are checked when you prepare an order.
            </p>
          )}
        </section>
      )}

      {preview && preview.status !== "HOLD" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-semibold" htmlFor="usdc">
                Amount (USDC, max 5)
              </label>
              <input
                id="usdc"
                type="number"
                min="0.5"
                max="5"
                step="0.5"
                value={usdc}
                onChange={(e) => setUsdc(e.target.value)}
                className="w-28 rounded border border-current/20 bg-transparent px-3 py-2 font-mono text-sm"
              />
            </div>
            <WalletMultiButton />
            <button
              onClick={prepareOrder}
              disabled={!publicKey || !!busy || !!signature || !!pending}
              className="rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
            >
              Prepare order
            </button>
          </div>
        </section>
      )}

      {heldOrder && (
        <section className="space-y-3 rounded border border-red-600/40 p-4">
          <div className="flex items-center gap-3">
            <StatusBadge status="HOLD" />
            <span className="text-sm">No transaction was built for you to sign.</span>
          </div>
          <Reasons reasons={heldOrder.reasons} />
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
            <dd className="font-mono">{fmtTokens(tokensUi(order.expected.netOutRaw, order.expected.decimals, order.expected.multiplier))} {order.symbol}</dd>
            <dt className="opacity-70">Minimum if swap succeeds</dt>
            <dd className="font-mono">{fmtTokens(tokensUi(order.expected.minOutRaw, order.expected.decimals, order.expected.multiplier))} {order.symbol}</dd>
            <dt className="opacity-70">Price per token</dt>
            <dd className="font-mono">
              ${order.check.metrics.executablePrice?.toFixed(2)}
              {order.check.metrics.premiumPct !== undefined && ` (${order.check.metrics.premiumPct >= 0 ? "+" : ""}${order.check.metrics.premiumPct.toFixed(2)}% vs issuer mark)`}
            </dd>
            <dt className="opacity-70">Wallet SOL cost</dt>
            <dd className="font-mono">{fmtSol(order.expected.walletSolCostLamports)}</dd>
            <dt className="opacity-70">Route</dt>
            <dd className="font-mono">Jupiter ({order.router})</dd>
          </dl>
          <p className="text-xs opacity-60">
            Below the minimum the swap reverts and you keep your USDC, but the network fee is still charged.
          </p>
          <Reasons reasons={order.check.reasons} />
          {disclosures.length > 0 && (
            <div className="space-y-2">
              {disclosures.map((r) => (
                <label key={r.code} className="flex items-start gap-2 text-sm">
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
          <div className="flex items-center gap-3">
            <button
              onClick={signAndSubmit}
              disabled={!canSign}
              className="rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
            >
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
