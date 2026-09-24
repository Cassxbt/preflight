function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable ${name}`);
  return value;
}

export const serverEnv = {
  jupiterApiKey: () => required("JUPITER_API_KEY"),
  solanaRpcUrl: () => required("SOLANA_RPC_URL"),
};
