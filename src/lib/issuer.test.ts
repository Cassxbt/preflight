import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import registry from "@/data/lifecycle.json";
import { inspectIssuerPage, pageText, sha256Matches } from "./issuer";
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
  it("drops markup and scripts and decodes entities", () => {
    expect(pageText("<p>swapped&nbsp;into <b>$SPCXx</b> &amp; more</p><script>var x = 'hidden'</script>")).toBe("swapped into $SPCXx & more");
    expect(pageText("it&#39;s &#x24;5")).toBe("it's $5");
    expect(pageText("a &#99999999; b")).toBe("a &#99999999; b");
  });
});
