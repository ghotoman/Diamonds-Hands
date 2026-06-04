import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

/// wagmi config V1: Base Sepolia only, connectors injected
/// (MetaMask / Rabby / in-wallet webview) and Coinbase Wallet.
export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "Diamond Hands", preference: "all" }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
