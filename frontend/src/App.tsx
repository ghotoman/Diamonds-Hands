import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

import { ConnectButton } from "./components/ConnectButton";
import { CreateVaultForm } from "./components/CreateVaultForm";
import { VaultList, type VaultListHandle } from "./components/VaultList";
import { FACTORY_ADDRESS, TARGET_CHAIN } from "./lib/addresses";
import { shortAddr } from "./lib/format";

export default function App() {
  const { isConnected } = useAccount();
  const listRef = useRef<VaultListHandle>(null);

  // MiniKit: signal the Base App that the mini app is ready (hides splash).
  // No-op outside a Base App / Farcaster Mini App context.
  const { setMiniAppReady, isMiniAppReady, context } = useMiniKit();
  useEffect(() => {
    if (!isMiniAppReady) void setMiniAppReady();
  }, [isMiniAppReady, setMiniAppReady]);

  const inMiniApp = !!context;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">💎 Diamond Hands</h1>
          <p className="text-sm text-slate-400">
            Lock your ERC-20 and beat paper hands · {TARGET_CHAIN.name}
            {inMiniApp && (
              <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
                Base App
              </span>
            )}
          </p>
        </div>
        <ConnectButton />
      </header>

      {!isConnected ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <p className="text-lg text-slate-300">
            Connect your wallet to create and manage vaults.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
          <CreateVaultForm onCreated={() => listRef.current?.refetch()} />
          <VaultList ref={listRef} />
        </div>
      )}

      <footer className="mt-10 border-t border-slate-800 pt-4 text-xs text-slate-500">
        Factory:{" "}
        <a
          href={`https://sepolia.basescan.org/address/${FACTORY_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sky-400 hover:underline"
        >
          {shortAddr(FACTORY_ADDRESS)}
        </a>
      </footer>
    </div>
  );
}
