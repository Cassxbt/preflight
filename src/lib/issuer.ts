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
  /\b(expir(e|es|ed|ing|y|ation)|worthless|swap(s|ped|ping)? (into|for|to)|swap (your|window)|conver(t|ted|ts|sion)|redeem(ed|able|ing)?|redemption|delist(ed|ing)?|wind(ing)?[- ]down|burn(ed|t)|halt(ed)?|suspend(ed)?|paused|migrat(e|ed|ion)|merge(s|d|r)?|acqui(red|sition)|exchange your|claim(ed)? (your|by)|gone public|IPO|deadline|settle(d|ment))\b/i;
// Only containers end a block, so inline markup and line breaks never cut a date or amount off a notice.
const BLOCK_END = /<\/(?:div|p|li|section|article|main|header|footer|aside|nav|table|tr|td|h[1-6])>/i;
const MAX_NOTICE_CHARS = 600;
const CONTEXT_BEFORE_MATCH = 200;

// A long block is quoted around its lifecycle words, so the part that matters is never the part cut off.
function excerpt(text: string): string {
  if (text.length <= MAX_NOTICE_CHARS) return text;
  const start = Math.max(0, text.search(LIFECYCLE_WORDS) - CONTEXT_BEFORE_MATCH);
  const end = Math.min(text.length, start + MAX_NOTICE_CHARS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

export function issuerNotices(html: string): string[] {
  const blocks = visibleMarkup(html)
    .split(BLOCK_END)
    .map(pageText)
    .filter((text) => LIFECYCLE_WORDS.test(text))
    .map(excerpt);
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

// Evidence reads can hold a buy, so they always retry; notice reads only disclose, so a failing page is not retried on every check.
const READS = {
  evidence: { timeoutMs: EVIDENCE_TIMEOUT_MS, rememberFailure: false },
  notices: { timeoutMs: NOTICE_TIMEOUT_MS, rememberFailure: true },
} as const;

// Concurrent checks of the same kind share one request; the two kinds never share a request or a failure.
async function fetchIssuerPage(url: string, kind: keyof typeof READS): Promise<Page> {
  const cached = pages.get(url);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < PAGE_CACHE_MS) return cached;
  const key = `${kind}:${url}`;
  const failed = failures.get(key);
  if (failed && Date.now() - failed.at < FAILURE_CACHE_MS) throw failed.error;
  const pending = inflight.get(key);
  if (pending) return pending;
  const { timeoutMs, rememberFailure } = READS[kind];
  const request = requestPage(url, timeoutMs)
    .then((page) => {
      pages.set(url, page);
      failures.delete(key);
      return page;
    })
    .catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      if (rememberFailure) failures.set(key, { error, at: Date.now() });
      throw error;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

// The live page is the evidence; the reviewed capture's hash is its provenance.
export async function verifyIssuerEvidence(entry: LifecycleEntry): Promise<IssuerEvidence> {
  const [page, capture] = await Promise.all([fetchIssuerPage(entry.issuerUrl, "evidence"), readCapture(entry)]);
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
  const page = await fetchIssuerPage(issuerUrl, "notices");
  if (!linkedMints(page.html).includes(mint)) throw new Error(`${issuerUrl} does not link this mint`);
  return { issuerUrl, fetchedAt: page.fetchedAt, lines: issuerNotices(page.html), reviewed: [] };
}
