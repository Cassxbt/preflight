import { JUPITER_SWAP_BASE } from "./constants";
import { serverEnv } from "./env";

export type ApiInstruction = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};

export type MetaOrder = {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  inAmount?: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
  priceImpactPct?: string;
  slippageBps?: number;
  otherAmountThreshold?: string;
  lastValidBlockHeight?: number;
  expireAt?: string;
  prioritizationFeeLamports?: number;
  signatureFeeLamports?: number;
  rentFeeLamports?: number;
  errorCode?: number;
  errorMessage?: string;
};

export type ExecuteResult = {
  status: "Success" | "Failed";
  signature: string;
  code: number;
  totalInputAmount: string;
  totalOutputAmount: string;
  inputAmountResult: string;
  outputAmountResult: string;
  error?: string;
};

export type RouterBuild = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  routePlan: { percent: number; swapInfo: { label: string; ammKey: string } }[];
  computeBudgetInstructions: ApiInstruction[];
  setupInstructions: ApiInstruction[];
  swapInstruction: ApiInstruction;
  cleanupInstruction: ApiInstruction | null;
  otherInstructions: ApiInstruction[];
  tipInstruction: ApiInstruction | null;
  addressesByLookupTableAddress: Record<string, string[]> | null;
  blockhashWithMetadata: { blockhash: number[]; lastValidBlockHeight: number };
};

type SwapRequest = { inputMint: string; outputMint: string; amount: bigint; taker: string };
type QuoteRequest = Omit<SwapRequest, "taker"> & { taker?: string; slippageBps?: number };

async function jupiterGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${JUPITER_SWAP_BASE}${path}?${new URLSearchParams(params)}`;
  const send = () => fetch(url, { headers: { "x-api-key": serverEnv.jupiterApiKey() }, cache: "no-store" });
  let res = await send();
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await send();
  }
  if (!res.ok) throw new Error(`Jupiter ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Without a taker, Jupiter returns a quote only and builds no transaction.
export function metaOrder(req: QuoteRequest): Promise<MetaOrder> {
  const params: Record<string, string> = { inputMint: req.inputMint, outputMint: req.outputMint, amount: req.amount.toString() };
  if (req.taker) params.taker = req.taker;
  if (req.slippageBps !== undefined) params.slippageBps = String(req.slippageBps);
  return jupiterGet<MetaOrder>("/order", params);
}

export function routerBuild(req: SwapRequest, slippageBps: number): Promise<RouterBuild> {
  return jupiterGet<RouterBuild>("/build", {
    inputMint: req.inputMint,
    outputMint: req.outputMint,
    amount: req.amount.toString(),
    taker: req.taker,
    slippageBps: String(slippageBps),
  });
}

export async function metaExecute(signedTransaction: string, requestId: string): Promise<ExecuteResult> {
  const res = await fetch(`${JUPITER_SWAP_BASE}/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": serverEnv.jupiterApiKey() },
    body: JSON.stringify({ signedTransaction, requestId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Jupiter /execute ${res.status}: ${await res.text()}`);
  return res.json() as Promise<ExecuteResult>;
}
