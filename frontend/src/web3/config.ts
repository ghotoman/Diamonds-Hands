import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

import { TARGET_CHAIN } from "./contracts";

/// RPC URLs per network. The active chain (TARGET_CHAIN) is picked first;
/// the other is left on its public default and is just a typing requirement
/// of wagmi's `chains: readonly [...]` tuple.
const mainnetRpc = import.meta.env.VITE_BASE_RPC_URL as string | undefined;
const testnetRpc = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL as string | undefined;

/// wagmi config — single ACTIVE chain (TARGET_CHAIN: mainnet by default, or
/// Base Sepolia when VITE_USE_TESTNET=1). Both chains are declared so the
/// network-mismatch UI can label the other one; the active one is first.
/// - farcasterMiniApp: the Base App / Farcaster Mini App wallet. App.tsx
///   auto-connects it when running inside a Mini App (see useMiniKit context).
/// - injected / coinbaseWallet: standalone web fallback.
export const config = createConfig({
  chains: TARGET_CHAIN.id === base.id ? [base, baseSepolia] : [baseSepolia, base],
  connectors: [
    farcasterMiniApp(),
    injected(),
    coinbaseWallet({ appName: "Diamond Hands", preference: "all" }),
  ],
  transports: {
    [base.id]: http(mainnetRpc),
    [baseSepolia.id]: http(testnetRpc),
  },
});

/// Connector id of the Farcaster Mini App connector. Used both to auto-connect
/// inside the Base App and as the manual-connect target there.
export const FARCASTER_CONNECTOR_ID = "farcaster";

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
