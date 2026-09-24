"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

// The browser never reads or broadcasts through this endpoint: quotes, simulation and
// submission all run server-side. It exists only because the adapter requires one.
const UNUSED_ENDPOINT = "https://api.mainnet-beta.solana.com";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={UNUSED_ENDPOINT}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
