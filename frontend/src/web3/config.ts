import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

const rpcUrl = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL;

/// wagmi config: Base Sepolia only.
/// - farcasterMiniApp: the Base App / Farcaster Mini App wallet. App.tsx
///   auto-connects it when running inside a Mini App (see useMiniKit context).
/// - injected / coinbaseWallet: standalone web fallback.
export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    farcasterMiniApp(),
    injected(),
    coinbaseWallet({ appName: "Diamond Hands", preference: "all" }),
  ],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
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
