import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";

import { config } from "./web3/config";
import { TARGET_CHAIN } from "./web3/contracts";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const queryClient = new QueryClient();

const onchainKitApiKey = import.meta.env.VITE_ONCHAINKIT_API_KEY || undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <OnchainKitProvider apiKey={onchainKitApiKey} chain={TARGET_CHAIN}>
            {/* MiniKit: Base App (Farcaster Mini App) context + auto-connect */}
            <MiniKitProvider enabled>
              <App />
            </MiniKitProvider>
          </OnchainKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
