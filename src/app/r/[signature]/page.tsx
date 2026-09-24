import { notFound } from "next/navigation";
import { fmtSol, fmtTokens, shortKey, tokensUi } from "@/lib/format";
import { buildReceipt } from "@/lib/receipt";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="opacity-70">{label}</dt>
      <dd className="font-mono break-all">{children}</dd>
    </>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded border border-current/15 p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-xs opacity-60">{note}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">{children}</dl>
    </section>
  );
}

export default async function ReceiptPage(props: PageProps<"/r/[signature]">) {
  const { signature } = await props.params;
  const receipt = await buildReceipt(signature);
  if (!receipt) notFound();

  const { chainVerified: chain, appRecorded: app, issuerAttested: issuer } = receipt;
  const decimals = receipt.decimals ?? 0;
  const multiplier = receipt.multiplier ?? 1;
  const tokens = (raw?: string) => (raw === undefined ? "—" : `${fmtTokens(tokensUi(raw, decimals, multiplier))} ${receipt.symbol ?? ""}`);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Preflight receipt</h1>
        <p className="font-mono text-xs break-all opacity-70">{signature}</p>
      </header>

      <Section title="Chain verified" note="Read from Solana just now. Anyone can reproduce these numbers from the signature.">
        {chain.found ? (
          <>
            <Row label="Result">{chain.success ? "Succeeded" : "Failed on chain"}</Row>
            <Row label="Block time">{chain.blockTime ?? "—"}</Row>
            <Row label="Slot">{chain.slot}</Row>
            <Row label="Fee payer">{chain.feePayer && shortKey(chain.feePayer)}</Row>
            <Row label="USDC debited">{chain.usdcDebitedRaw !== undefined ? `${Number(chain.usdcDebitedRaw) / 1e6} USDC` : "—"}</Row>
            <Row label="Tokens credited">{tokens(chain.tokenCreditedRaw)}</Row>
            <Row label="Network fee">{chain.networkFeeLamports !== undefined ? fmtSol(chain.networkFeeLamports) : "—"}</Row>
          </>
        ) : (
          <Row label="Status">
            {chain.expired
              ? "Expired before landing. This transaction can never execute, and no funds moved."
              : "Not found on chain yet. If it lands it will appear here; reload in a minute."}
          </Row>
        )}
      </Section>

      <Section title="App recorded" note="What Preflight checked and expected before you signed. Stored by this app; not provable on chain.">
        {app ? (
          <>
            <Row label="Verdict">{app.status}</Row>
            <Row label="Reasons">{app.reasons.length ? app.reasons.map((r) => r.code).join(", ") : "none"}</Row>
            <Row label="Checked at">{app.checkedAt}</Row>
            <Row label="Expected credit">{tokens(app.expectedNetOutRaw)}</Row>
            <Row label="Actual credit">{tokens(chain.tokenCreditedRaw)}</Row>
            <Row label="Jupiter reported">
              {!app.executeReported
                ? "No answer from Jupiter; the chain section above is authoritative"
                : app.executeReported.status === "Success"
                  ? `Success, ${tokens(app.executeReported.outputAmountResult)}`
                  : `${app.executeReported.status}: ${app.executeReported.error ?? "no reason given"} (code ${app.executeReported.code})`}
            </Row>
            <Row label="Expected SOL cost">{fmtSol(app.expectedSolCostLamports)}</Row>
            <Row label="Route">Jupiter ({app.router})</Row>
            <Row label="Verdict hash">{app.verdictHash}</Row>
          </>
        ) : (
          <Row label="Status">No Preflight order is recorded for this signature.</Row>
        )}
      </Section>

      {issuer && (
        <Section title="Issuer attested" note="What the issuer published at check time. Preflight quotes it; it does not vouch for it.">
          <Row label="Catalog retrieved">{issuer.catalogRetrievedAt ?? "—"}</Row>
          <Row label="Issuer mark price">{issuer.markPrice !== null ? `$${issuer.markPrice.toFixed(2)}` : "—"}</Row>
          <Row label="Lifecycle notice">
            {issuer.lifecycle ? String((issuer.lifecycle as { statement?: string }).statement ?? "") : "none on file"}
          </Row>
        </Section>
      )}
    </main>
  );
}
