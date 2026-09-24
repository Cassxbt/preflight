import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog";

const row = (symbol: string, mint: string, markPrice: number) => ({
  name: `${symbol} PreStocks`,
  symbol,
  contract_address: mint,
  markPrice,
  tokenPrice: 100,
});

describe("parseCatalog", () => {
  it("keeps readable rows and reports the mint of a malformed one", () => {
    const catalog = parseCatalog([row("ANTHROPIC", "Pren1F", 1038), row("BROKEN", "PreBad1", 0)]);
    expect(catalog.entries.map((e) => e.symbol)).toEqual(["ANTHROPIC"]);
    expect(catalog.unreadableMints).toEqual(["PreBad1"]);
  });

  it("fails when nothing is readable", () => {
    expect(() => parseCatalog([row("BROKEN", "PreBad1", 0)])).toThrow("no readable entries");
    expect(() => parseCatalog({ not: "an array" })).toThrow();
  });
});
