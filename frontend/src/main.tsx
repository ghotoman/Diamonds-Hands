import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";

import { config } from "./wagmi";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const onchainKitApiKey = import.meta.env.VITE_ONCHAINKIT_API_KEY || undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider apiKey={onchainKitApiKey} chain={baseSepolia}>
          {/* MiniKit: Base App (Farcaster Mini App) context + auto-connect */}
          <MiniKitProvider enabled>
            <App />
          </MiniKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
