export function tokensUi(raw: string | bigint, decimals: number, multiplier: number): number {
  return (Number(raw) / 10 ** decimals) * multiplier;
}

export function fmtTokens(n: number): string {
  return n.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}

export function fmtSol(lamports: number): string {
  return `${(lamports / 1e9).toFixed(6)} SOL`;
}

export function shortKey(key: string): string {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "12 Sep 2026, 23:59 UTC". Formatted by hand so server and browser always agree.
export function fmtDate(iso: string, withSeconds = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toISOString().slice(11, withSeconds ? 19 : 16);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${time} UTC`;
}

export function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
