import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

/// wagmi config V1: Base Sepolia only.
/// - farcasterMiniApp: used automatically when running inside the Base App
///   (Farcaster Mini App webview); MiniKit auto-connects it.
/// - injected / coinbaseWallet: standalone web fallback.
export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    farcasterMiniApp(),
    injected(),
    coinbaseWallet({ appName: "Diamond Hands", preference: "all" }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

/// Connector id used by the Farcaster Mini App connector. Hidden from the
/// manual connect list in standalone web (it auto-connects inside Base App).
export const FARCASTER_CONNECTOR_ID = "farcaster";

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
