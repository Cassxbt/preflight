import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderWithSlippageFloor, sizeImpactPct } from "./gather";
import { metaOrder, type MetaOrder } from "./jupiter";

vi.mock("./jupiter", () => ({ metaOrder: vi.fn() }));
const order = vi.mocked(metaOrder);

const MINT = "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw";
const WALLET = "7DbwrCzZqk34xLqK3aZ2xBfM9awdB3izELt9vCSsu1H5";

const quote = (over: Partial<MetaOrder>): MetaOrder => ({
  transaction: "tx",
  requestId: "r",
  outAmount: "1000000",
  router: "metis",
  mode: "ultra",
  feeBps: 10,
  feeMint: "usdc",
  ...over,
});

beforeEach(() => order.mockReset());

describe("orderWithSlippageFloor", () => {
  it("re-requests at the floor when Jupiter's automatic slippage is below the transfer fee plus 1%", async () => {
    order.mockResolvedValueOnce(quote({ slippageBps: 100 })).mockResolvedValueOnce(quote({ slippageBps: 200, requestId: "floored" }));
    const result = await orderWithSlippageFloor(MINT, WALLET, 2_000_000n, 200);
    expect(result.requestId).toBe("floored");
    expect(order).toHaveBeenLastCalledWith(expect.objectContaining({ slippageBps: 200, taker: WALLET }));
  });

  it("keeps Jupiter's choice when it is already at or above the floor", async () => {
    order.mockResolvedValueOnce(quote({ slippageBps: 500 }));
    expect((await orderWithSlippageFloor(MINT, WALLET, 2_000_000n, 200)).slippageBps).toBe(500);
    expect(order).toHaveBeenCalledTimes(1);
  });
});

describe("sizeImpactPct", () => {
  it("is zero at or below the $1 reference size without another quote", async () => {
    expect(await sizeImpactPct(MINT, 1_000_000n, 500_000n, "metis")).toBe(0);
    expect(order).not.toHaveBeenCalled();
  });

  it("compares tokens per dollar against a taker-less $1 quote on the same router", async () => {
    order.mockResolvedValueOnce(quote({ outAmount: "1000", router: "metis" }));
    expect(await sizeImpactPct(MINT, 2_000_000n, 1_900n, "metis")).toBeCloseTo(5, 10);
    expect(order).toHaveBeenCalledWith({ inputMint: expect.any(String), outputMint: MINT, amount: 1_000_000n });
  });

  it("returns null (not evaluated) when the reference quote took a different router", async () => {
    order.mockResolvedValueOnce(quote({ outAmount: "1000", router: "dflow" }));
    expect(await sizeImpactPct(MINT, 2_000_000n, 1_900n, "metis")).toBeNull();
  });

  it("returns null when the reference quote fails", async () => {
    order.mockRejectedValueOnce(new Error("429"));
    expect(await sizeImpactPct(MINT, 2_000_000n, 1_900n, "metis")).toBeNull();
  });
});
