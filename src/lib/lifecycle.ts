import registry from "@/data/lifecycle.json";

export type LifecycleEntry = {
  symbol: string;
  mint: string;
  state: "window_closed" | "deadline_ahead";
  deadline: string;
  issuerUrl: string;
  statement: string;
  capturedAt: string;
  sha256: string;
};

const entries = registry.entries as LifecycleEntry[];

export function lifecycleFor(mint: string): LifecycleEntry | undefined {
  return entries.find((e) => e.mint === mint);
}
