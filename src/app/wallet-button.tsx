"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal, WalletMultiButton } from "@solana/wallet-adapter-react-ui";

// Connected, the library button shows the address and its menu; otherwise a plain Connect that opens the picker.
export function WalletButton() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  if (publicKey) return <WalletMultiButton />;
  return (
    <button
      onClick={() => setVisible(true)}
      className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background transition-transform duration-500 ease-spring active:scale-[0.97]"
    >
      Connect
    </button>
  );
}
