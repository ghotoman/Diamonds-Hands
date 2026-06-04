import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

/// wagmi-конфигурация V1: только Base Sepolia, коннекторы injected
/// (MetaMask/Rabbit/Base App webview) и Coinbase Wallet.
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
