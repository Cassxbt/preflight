import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fmtDate, fmtSol, fmtTokens, fmtUsd, shortKey, tokensUi } from "@/lib/format";
import { buildReceipt } from "@/lib/receipt";
import { SiteFooter, SiteHeader } from "../../_site/chrome";
import { Bezel, Cta, Eyebrow } from "../../_site/primitives";
import { StatusLight } from "../../_site/verdict-card";
import { ReceiptTicket } from "../../_site/visuals";

// Metadata and the page share one build per request.
const getReceipt = cache(buildReceipt);

export async function generateMetadata(props: PageProps<"/r/[signature]">): Promise<Metadata> {
  const receipt = await getReceipt((await props.params).signature).catch(() => null);
  if (!receipt) return { title: "Receipt not found · Preflight" };
  const usdc = receipt.chainVerified.usdcDebitedRaw ? Number(receipt.chainVerified.usdcDebitedRaw) / 1e6 : null;
  return { title: `Receipt · ${usdc ?? "?"} USDC → ${receipt.symbol ?? "token"} · Preflight` };
}

const TAG: Record<string, string> = { chain: "text-clear", app: "text-muted", issuer: "text-disclose" };

function Group({ title, tag, note, rows }: { title: string; tag: "chain" | "app" | "issuer"; note: string; rows: [string, React.ReactNode][] }) {
  return (
    <Bezel inner="p-6">
      <div className="flex items-center justify-between">
        <p className="font-semibold tracking-tight">{title}</p>
        <span className={`font-mono text-[10px] tracking-[0.18em] uppercase ${TAG[tag]}`}>{tag}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{note}</p>
      <dl className="mt-5 divide-y divide-white/[0.06]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-6 py-2.5">
            <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
            <dd className="tabular text-right font-mono text-[13px] [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </Bezel>
  );
}

export default async function ReceiptPage(props: PageProps<"/r/[signature]">) {
  const { signature } = await props.params;
  const receipt = await getReceipt(signature);
  if (!receipt) notFound();

  const { chainVerified: chain, appRecorded: app, issuerAttested: issuer } = receipt;
  const tokens = (raw?: string) => (raw === undefined ? "—" : `${fmtTokens(tokensUi(raw, receipt.decimals, receipt.multiplier))} ${receipt.symbol ?? ""}`);
  const gap = chain.tokenCreditedRaw !== undefined ? (Number(chain.tokenCreditedRaw) / Number(app.expectedNetOutRaw) - 1) * 100 : null;
  const lifecycle = issuer?.lifecycle as { statement?: string } | null | undefined;
  const usdcSpent = chain.usdcDebitedRaw !== undefined ? Number(chain.usdcDebitedRaw) / 1e6 : null;
  const tokensReceived = chain.tokenCreditedRaw !== undefined ? tokensUi(chain.tokenCreditedRaw, receipt.decimals, receipt.multiplier) : null;
  const pricePaid = usdcSpent !== null && tokensReceived ? usdcSpent / tokensReceived : null;
  const vsMark = pricePaid !== null && issuer?.markPrice ? (pricePaid / issuer.markPrice - 1) * 100 : null;
  const company = receipt.symbol ? receipt.symbol.charAt(0) + receipt.symbol.slice(1).toLowerCase() : "the token";

  const chainRows: [string, React.ReactNode][] = chain.found
    ? [
        ["Result", chain.success === undefined ? "—" : chain.success ? <span key="r" className="text-clear">Confirmed</span> : <span key="r" className="text-hold">Failed on chain</span>],
        ["Price paid per token", pricePaid !== null ? `${fmtUsd(pricePaid)}${vsMark !== null ? ` · ${vsMark >= 0 ? "+" : "−"}${Math.abs(vsMark).toFixed(2)}% vs mark` : ""}` : "—"],
        ["Block time", chain.blockTime ? fmtDate(chain.blockTime, true) : "—"],
        ["Slot", chain.slot?.toLocaleString("en-US") ?? "—"],
        ["Fee payer", chain.feePayer ? shortKey(chain.feePayer) : "—"],
        ["USDC debited", chain.usdcDebitedRaw !== undefined ? `${(Number(chain.usdcDebitedRaw) / 1e6).toFixed(6)} USDC` : "—"],
        ["Tokens credited", tokens(chain.tokenCreditedRaw)],
        ["Wallet SOL spent", chain.walletSolSpentLamports !== undefined ? fmtSol(chain.walletSolSpentLamports) : "—"],
        ["of which network fee", chain.networkFeeLamports !== undefined ? fmtSol(chain.networkFeeLamports) : "—"],
      ]
    : [
        [
          "Status",
          chain.lookupError
            ? "The chain could not be read just now. Reload; this does not mean the purchase failed."
            : chain.expired
              ? "Expired before landing. It can never execute, and no funds moved."
              : "Not found on chain yet. Reload in a minute.",
        ],
      ];

  const appRows: [string, React.ReactNode][] = [
    ["Verdict", <StatusLight key="v" status={app.status} />],
    ["Reasons", app.reasons.length ? app.reasons.map((r) => r.code).join(", ") : "none"],
    ["Acknowledged", app.ackedReasons === null ? "Not recorded for this early receipt" : app.ackedReasons.length ? app.ackedReasons.join(", ") : "nothing to acknowledge"],
    ["Checked", fmtDate(app.checkedAt, true)],
    ["Expected credit", tokens(app.expectedNetOutRaw)],
    ["Actual vs expected", gap === null ? "—" : `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(2)}%`],
    [
      "Jupiter reported",
      !app.executeReported
        ? "no answer; the chain is authoritative"
        : app.executeReported.status === "Success"
          ? `Success · ${fmtTokens(tokensUi(app.executeReported.outputAmountResult, receipt.decimals, receipt.multiplier))}`
          : `${app.executeReported.status} · ${app.executeReported.error ?? "no reason"} (${app.executeReported.code})`,
    ],
    ["Expected SOL cost", fmtSol(app.expectedSolCostLamports)],
    ["Route", `Jupiter · ${app.router}`],
    ["Verdict SHA-256", `${app.verdictHash.slice(0, 16)}…`],
  ];

  const issuerRows: [string, React.ReactNode][] = issuer
    ? [
        ["Issuer mark", issuer.markPrice !== null ? fmtUsd(issuer.markPrice) : "—"],
        ["Catalog read", issuer.catalogRetrievedAt ? fmtDate(issuer.catalogRetrievedAt, true) : "—"],
        ["Lifecycle notice", lifecycle?.statement ?? "none on file"],
      ]
    : [["Issuer evidence", "not recorded"]];

  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip pt-4">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[600px]">
        <div className="grid-backdrop absolute inset-0 opacity-60" />
      </div>
      <SiteHeader links={false} />
      <main className="relative mx-auto w-full max-w-6xl flex-1 space-y-12 px-4 pt-16 pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <Eyebrow>Preflight receipt</Eyebrow>
            <h1 className="font-display text-6xl leading-[0.95] tracking-[-0.02em]">
              {usdcSpent !== null ? `${usdcSpent} USDC` : "Purchase"} <em className="text-muted">into {company}.</em>
            </h1>
            <p className="max-w-md text-[15px] leading-relaxed text-muted">
              What the chain proves, what Preflight checked before you signed, and what the issuer published, kept apart so each can be checked on its own.
            </p>
            <div className="flex flex-wrap gap-3">
              <Cta href={`https://solscan.io/tx/${signature}`}>View on Solscan</Cta>
              <Cta href={`/api/receipt/${signature}`} variant="quiet">
                Receipt JSON
              </Cta>
            </div>
          </div>
          <ReceiptTicket receipt={receipt} tilt={false} />
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-4">
            <Group title="Chain verified" tag="chain" note="Read from Solana at confirmed commitment. Anyone can reproduce it from the signature." rows={chainRows} />
            <Group title="Issuer attested" tag="issuer" note="What PreStocks published at check time. Preflight quotes it; it does not vouch for it." rows={issuerRows} />
          </div>
          <Group title="App recorded" tag="app" note="What Preflight checked and expected before signing. Stored by Preflight, not on chain." rows={appRows} />
        </div>

        <p className="max-w-3xl text-xs leading-relaxed text-muted">
          The verdict SHA-256 is computed over the verdict object in the receipt JSON, serialized with sorted keys. It lets you detect later edits if you saved the
          JSON at signing time; it is not anchored on chain.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
