import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import registry from "@/data/lifecycle.json";
import { inspectIssuerPage, issuerNotices, issuerPageUrl, pageText, readIssuerNotices, sha256Matches, verifyIssuerEvidence } from "./issuer";
import type { LifecycleEntry } from "./lifecycle";

const entries = registry.entries as LifecycleEntry[];
const capture = (e: LifecycleEntry) => readFileSync(path.join(process.cwd(), "src/data", e.capture));

describe.each(entries)("$symbol capture", (entry) => {
  it("matches the hash recorded in the registry", () => {
    expect(sha256Matches(capture(entry), entry.sha256)).toBe(true);
  });

  it("links the registry mint and contains the reviewed lifecycle statement", () => {
    expect(inspectIssuerPage(capture(entry).toString("utf8"), entry)).toMatchObject({ mintLinked: true, statementPresent: true });
  });

  it("fails the hash after a one-character edit", () => {
    const original = capture(entry).toString("utf8");
    expect(original).toContain("11:59pm");
    const tampered = Buffer.from(original.replaceAll("11:59pm", "11:58pm"));
    expect(sha256Matches(tampered, entry.sha256)).toBe(false);
    expect(inspectIssuerPage(tampered.toString("utf8"), entry).statementPresent).toBe(false);
  });

  it("finds the reviewed lifecycle notice on the captured page", () => {
    const notices = issuerNotices(capture(entry).toString("utf8"));
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.some((n) => n.includes(entry.statement) || entry.statement.includes(n))).toBe(true);
  });

  it("detects a page that links a different mint", () => {
    const swapped = capture(entry).toString("utf8").replaceAll(entry.mint, "So11111111111111111111111111111111111111112");
    expect(inspectIssuerPage(swapped, entry)).toMatchObject({ mintLinked: false, linkedMints: expect.arrayContaining(["So11111111111111111111111111111111111111112"]) });
  });
});

describe("inspectIssuerPage against a page that only pretends to agree", () => {
  const entry = { mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", statement: "swapped before 12 March 2027" };

  it("ignores the mint when it survives only in a comment or script", () => {
    const html = `<!-- <a href="https://solscan.io/token/${entry.mint}"> --><script>"https://solscan.io/token/${entry.mint}"</script><p>swapped before 12 March 2027</p>`;
    expect(inspectIssuerPage(html, entry)).toMatchObject({ mintLinked: false, statementPresent: true });
  });

  it("ignores the statement when it survives only in hidden markup", () => {
    const html = `<a href="https://solscan.io/token/${entry.mint}">x</a><div hidden>swapped before 12 March 2027</div><p>Deadline extended</p>`;
    expect(inspectIssuerPage(html, entry)).toMatchObject({ mintLinked: true, statementPresent: false });
  });
});

describe("pageText", () => {
  it("does not let markup around a word change the punctuation after it", () => {
    expect(pageText("before 12 March <b>2027</b>, or they")).toBe("before 12 March 2027, or they");
  });

  it("drops markup and scripts and decodes entities", () => {
    expect(pageText("<p>swapped&nbsp;into <b>$SPCXx</b> &amp; more</p><script>var x = 'hidden'</script>")).toBe("swapped into $SPCXx & more");
    expect(pageText("it&#39;s &#x24;5")).toBe("it's $5");
    expect(pageText("a &#99999999; b")).toBe("a &#99999999; b");
  });
});

describe("issuerNotices", () => {
  const banner = (text: string) =>
    `<div class="bg-yellow-100 text-yellow-900"><span class="block">🚨 Anthropic has gone public!</span><span class="block">${text}</span></div>`;
  const notice = 'Anthropic PreStocks tokens must be swapped into <a href="https://solscan.io/token/x">$ANTHx</a> before 11:59pm UTC on 1 June 2027, or they will expire worthless.';
  const read = (body: string) => issuerNotices(`<main><h1>Token</h1><div>${body}</div><p>Price chart</p></main>`);

  it("reads a whole banner, headline included, as the issuer wrote it", () => {
    expect(issuerNotices(`<main><h1>Anthropic</h1>${banner(notice)}<p>Price chart</p></main>`)).toEqual([
      "🚨 Anthropic has gone public! Anthropic PreStocks tokens must be swapped into $ANTHx before 11:59pm UTC on 1 June 2027, or they will expire worthless.",
    ]);
  });

  it("keeps the date and amount when inline markup or a line break splits the sentence", () => {
    expect(read("<p>All tokens will be <span>redeemed</span> at $412.50 on<br>1 June 2027.</p>")).toEqual(["All tokens will be redeemed at $412.50 on 1 June 2027."]);
    expect(read('<p><span>Tokens must be swapped into</span><a href="#">$ANTHx</a><span>before 1 June 2027.</span></p>')).toEqual([
      "Tokens must be swapped into $ANTHx before 1 June 2027.",
    ]);
  });

  it.each([
    "Trading is halted until further notice.",
    "Tokens will be converted to shares at listing.",
    "The token was delisted on 3 May.",
    "Neuralink has gone public!",
    "Claims close at the conversion deadline.",
    "Holders migrate to the new mint next week.",
    "Kalshi swaps to KALSHIx on listing day.",
    "Figure AI merges with a listed company.",
    "Acquisition by SpaceX closes Friday.",
    "Exchange your tokens for shares at 1:1.",
    "Claim your shares by 30 June 2027.",
  ])("recognises lifecycle wording: %s", (text) => {
    expect(read(`<p>${text}</p>`)).toEqual([text]);
  });

  it("quotes the text around the lifecycle words when a block is long", () => {
    const [long] = read(`<p>${"Figure AI builds humanoid robots for warehouses. ".repeat(16)}Tokens will be redeemed on 1 June 2027.</p>`);
    expect(long).toContain("Tokens will be redeemed on 1 June 2027.");
    expect(long.startsWith("…")).toBe(true);
  });

  it("does not treat the word exchange alone as a notice", () => {
    expect(read("<p>PreStocks is not an exchange operator.</p>")).toEqual([]);
  });

  it("shortens a very long notice instead of dropping it", () => {
    const [long] = read(`<p>Tokens will expire worthless ${"unless swapped ".repeat(60)}</p>`);
    expect(long.length).toBeLessThanOrEqual(601);
    expect(long.endsWith("…")).toBe(true);
  });

  it("finds nothing on an ordinary token page", () => {
    expect(issuerNotices("<main><h1>Anduril</h1><p>Anduril builds autonomous defense systems.</p><p>Buy on Jupiter</p></main>")).toEqual([]);
  });

  it("ignores lifecycle words in scripts, comments and hidden markup", () => {
    const html = `<script>var t = "tokens will expire worthless"</script><!-- must be swapped --><div hidden>${notice}</div><p>Kalshi</p>`;
    expect(issuerNotices(html)).toEqual([]);
  });
});

describe("issuerPageUrl", () => {
  it("accepts only a single-segment PreStocks path and drops the www redirect", () => {
    expect(issuerPageUrl("https://www.prestocks.com/anthropic")).toBe("https://prestocks.com/anthropic");
    expect(issuerPageUrl("https://prestocks.com/spacex/")).toBe("https://prestocks.com/spacex");
    expect(issuerPageUrl("https://prestocks.com.evil.io/anthropic")).toBeNull();
    expect(issuerPageUrl("https://prestocks.com/a/b")).toBeNull();
    expect(issuerPageUrl("http://prestocks.com/anthropic")).toBeNull();
  });
});

describe("readIssuerNotices", () => {
  const MINT = "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw";
  const page = (body: string, url: string) => ({ ok: true, status: 200, url, text: async () => body });
  afterEach(() => vi.unstubAllGlobals());

  it("counts a page only when it links the token's own mint", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => page("<p>Nothing linked here</p>", url)));
    await expect(readIssuerNotices("https://prestocks.com/notlinked", MINT)).rejects.toThrow("does not link this mint");
  });

  it("refuses a page that redirected off prestocks.com", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page(`<a href="https://solscan.io/token/${MINT}">x</a>`, "https://elsewhere.example/anthropic")));
    await expect(readIssuerNotices("https://prestocks.com/redirected", MINT)).rejects.toThrow("left prestocks.com");
  });

  it("never lets a failed notice read hold the registry evidence read of the same page", async () => {
    const spacex = entries.find((e) => e.symbol === "SPACEX")!;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, url: spacex.issuerUrl, text: async () => "" })));
    await expect(readIssuerNotices(spacex.issuerUrl, spacex.mint)).rejects.toThrow("503");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => page(capture(spacex).toString("utf8"), url)));
    await expect(verifyIssuerEvidence(spacex)).resolves.toMatchObject({ mintLinked: true, statementPresent: true });
  });

  it("retries the registry evidence read on the next check after a failure", async () => {
    const xai = entries.find((e) => e.symbol === "XAI")!;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, url: xai.issuerUrl, text: async () => "" })));
    await expect(verifyIssuerEvidence(xai)).rejects.toThrow("503");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => page(capture(xai).toString("utf8"), url)));
    await expect(verifyIssuerEvidence(xai)).resolves.toMatchObject({ mintLinked: true });
  });

  it("shares one request between concurrent readers and remembers a failure briefly", async () => {
    const linked = `<div><a href="https://solscan.io/token/${MINT}">Solscan</a></div><p>Trading is halted.</p>`;
    const fetchMock = vi.fn(async (url: string) => page(linked, url));
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([readIssuerNotices("https://prestocks.com/shared", MINT), readIssuerNotices("https://prestocks.com/shared", MINT)]);
    expect(a.lines).toEqual(["Trading is halted."]);
    expect(b.lines).toEqual(a.lines);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const failing = vi.fn(async () => ({ ok: false, status: 503, url: "https://prestocks.com/down", text: async () => "" }));
    vi.stubGlobal("fetch", failing);
    await expect(readIssuerNotices("https://prestocks.com/down", MINT)).rejects.toThrow("503");
    await expect(readIssuerNotices("https://prestocks.com/down", MINT)).rejects.toThrow("503");
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
