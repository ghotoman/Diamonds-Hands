import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

const rpcUrl = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL;

/// wagmi config: Base Sepolia only.
/// - farcasterMiniApp: auto-connected by MiniKit inside the Base App.
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

/// Connector id of the Farcaster Mini App connector — hidden from the
/// manual connect list (it auto-connects inside the Base App).
export const FARCASTER_CONNECTOR_ID = "farcaster";

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
