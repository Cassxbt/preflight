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
  notices: string[];
  reviewedNotices: string[];
};

// `reviewed` holds the notices on the hashed capture; a live notice is reviewed only if it matches one exactly.
export type IssuerNotices = { issuerUrl: string; fetchedAt: string; lines: string[]; reviewed: string[] };

type Page = { html: string; fetchedAt: string };

const PAGE_CACHE_MS = 5 * 60_000;
const FAILURE_CACHE_MS = 60_000;
const NOTICE_TIMEOUT_MS = 3_000;
const EVIDENCE_TIMEOUT_MS = 8_000;
const pages = new Map<string, Page>();
const failures = new Map<string, { error: Error; at: number }>();
const inflight = new Map<string, Promise<Page>>();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// Comments, scripts, styles, templates and elements marked hidden are not what a visitor reads.
function visibleMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(\w+)\b[^>]*\shidden(?=[\s=>/])[^>]*>[\s\S]*?<\/\1>/gi, " ");
}

export function pageText(html: string): string {
  return visibleMarkup(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    })
    .replace(/\s+/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .trim();
}

// The issuer pages link each token's mint through a Solscan token URL in an anchor's href.
export function linkedMints(html: string): string[] {
  const found = visibleMarkup(html).matchAll(/<a\b[^>]*\shref="https:\/\/solscan\.io\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})"/gi);
  return [...new Set([...found].map((m) => m[1]))];
}

// PreStocks announces lifecycle events in a banner that says what holders must do and by when.
const LIFECYCLE_WORDS =
  /\b(expir(e|es|ed|ing|y|ation)|worthless|swap(ped)? (into|for)|swap (your|window)|conver(t|ted|ts|sion)|redeem(ed|able|ing)?|redemption|delist(ed|ing)?|wind(ing)?[- ]down|burn(ed|t)|halt(ed)?|suspend(ed)?|paused|migrat(e|ed|ion)|merged|acquired|gone public|IPO|deadline|settle(d|ment))\b/i;
// Only containers end a block, so inline markup and line breaks never cut a date or amount off a notice.
const BLOCK_END = /<\/(?:div|p|li|section|article|main|header|footer|aside|nav|table|tr|td|h[1-6])>/i;
const MAX_NOTICE_CHARS = 600;

export function issuerNotices(html: string): string[] {
  const blocks = visibleMarkup(html)
    .split(BLOCK_END)
    .map(pageText)
    .filter((text) => LIFECYCLE_WORDS.test(text))
    .map((text) => (text.length > MAX_NOTICE_CHARS ? `${text.slice(0, MAX_NOTICE_CHARS)}…` : text));
  return [...new Set(blocks)];
}

// Only the issuer's own single-segment token pages are fetched, whatever URL a catalog row carries.
export function issuerPageUrl(url: string): string | null {
  const match = /^https:\/\/(?:www\.)?prestocks\.com\/([a-z0-9-]+)\/?$/i.exec(url);
  return match ? `https://prestocks.com/${match[1].toLowerCase()}` : null;
}

export function inspectIssuerPage(html: string, entry: Pick<LifecycleEntry, "mint" | "statement">) {
  const mints = linkedMints(html);
  return { linkedMints: mints, mintLinked: mints.includes(entry.mint), statementPresent: pageText(html).includes(entry.statement) };
}

export function sha256Matches(bytes: Buffer, expected: string): boolean {
  return createHash("sha256").update(bytes).digest("hex") === expected;
}

async function readCapture(entry: LifecycleEntry): Promise<Buffer | null> {
  try {
    const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "src/data", entry.capture);
    const bytes = await readFile(file);
    return sha256Matches(bytes, entry.sha256) ? bytes : null;
  } catch {
    return null;
  }
}

async function requestPage(url: string, timeoutMs: number): Promise<Page> {
  const res = await fetch(url, { headers: { "user-agent": "preflight/0.1" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  if (res.url && !/^https:\/\/(www\.)?prestocks\.com\//i.test(res.url)) throw new Error(`${url} redirected and left prestocks.com`);
  return { html: await res.text(), fetchedAt: new Date().toISOString() };
}

// Concurrent checks share one request, and a failing page is not retried on every check.
async function fetchIssuerPage(url: string, timeoutMs = EVIDENCE_TIMEOUT_MS): Promise<Page> {
  const cached = pages.get(url);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < PAGE_CACHE_MS) return cached;
  const failed = failures.get(url);
  if (failed && Date.now() - failed.at < FAILURE_CACHE_MS) throw failed.error;
  const pending = inflight.get(url);
  if (pending) return pending;
  const request = requestPage(url, timeoutMs)
    .then((page) => {
      pages.set(url, page);
      failures.delete(url);
      return page;
    })
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      failures.set(url, { error, at: Date.now() });
      throw error;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}

// The live page is the evidence; the reviewed capture's hash is its provenance.
export async function verifyIssuerEvidence(entry: LifecycleEntry): Promise<IssuerEvidence> {
  const [page, capture] = await Promise.all([fetchIssuerPage(entry.issuerUrl), readCapture(entry)]);
  return {
    fetchedAt: page.fetchedAt,
    captureIntact: capture !== null,
    notices: issuerNotices(page.html),
    reviewedNotices: capture ? issuerNotices(capture.toString("utf8")) : [],
    ...inspectIssuerPage(page.html, entry),
  };
}

// A page that does not link the token's own mint is not that token's page, so it cannot vouch for an absence of notices.
export async function readIssuerNotices(issuerUrl: string, mint: string): Promise<IssuerNotices> {
  const page = await fetchIssuerPage(issuerUrl, NOTICE_TIMEOUT_MS);
  if (!linkedMints(page.html).includes(mint)) throw new Error(`${issuerUrl} does not link this mint`);
  return { issuerUrl, fetchedAt: page.fetchedAt, lines: issuerNotices(page.html), reviewed: [] };
}
