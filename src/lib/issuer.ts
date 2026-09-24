import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LifecycleEntry } from "./lifecycle";

export type IssuerEvidence = {
  fetchedAt: string;
  mintLinked: boolean;
  statementPresent: boolean;
  linkedMints: string[];
  captureIntact: boolean;
};

const PAGE_CACHE_MS = 5 * 60_000;
const pages = new Map<string, { html: string; fetchedAt: string }>();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function pageText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return String.fromCodePoint(n);
    })
    .replace(/\s+/g, " ")
    .trim();
}

// The issuer pages link each token's mint through a Solscan token URL.
export function linkedMints(html: string): string[] {
  const found = html.matchAll(/solscan\.io\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/g);
  return [...new Set([...found].map((m) => m[1]))];
}

export function inspectIssuerPage(html: string, entry: Pick<LifecycleEntry, "mint" | "statement">) {
  const mints = linkedMints(html);
  return { linkedMints: mints, mintLinked: mints.includes(entry.mint), statementPresent: pageText(html).includes(entry.statement) };
}

export function sha256Matches(bytes: Buffer, expected: string): boolean {
  return createHash("sha256").update(bytes).digest("hex") === expected;
}

async function captureIntact(entry: LifecycleEntry): Promise<boolean> {
  try {
    const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "src/data", entry.capture);
    return sha256Matches(await readFile(file), entry.sha256);
  } catch {
    return false;
  }
}

async function fetchIssuerPage(url: string): Promise<{ html: string; fetchedAt: string }> {
  const cached = pages.get(url);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < PAGE_CACHE_MS) return cached;
  const res = await fetch(url, { headers: { "user-agent": "preflight/0.1" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const page = { html: await res.text(), fetchedAt: new Date().toISOString() };
  pages.set(url, page);
  return page;
}

// The live page is the evidence; the reviewed capture's hash is its provenance.
export async function verifyIssuerEvidence(entry: LifecycleEntry): Promise<IssuerEvidence> {
  const [page, intact] = await Promise.all([fetchIssuerPage(entry.issuerUrl), captureIntact(entry)]);
  return { fetchedAt: page.fetchedAt, captureIntact: intact, ...inspectIssuerPage(page.html, entry) };
}
