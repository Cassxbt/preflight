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
