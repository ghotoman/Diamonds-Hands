import { useRef } from "react";
import { useAccount } from "wagmi";

import { ConnectButton } from "./components/ConnectButton";
import { CreateVaultForm } from "./components/CreateVaultForm";
import { VaultList, type VaultListHandle } from "./components/VaultList";
import { FACTORY_ADDRESS, TARGET_CHAIN } from "./lib/addresses";
import { shortAddr } from "./lib/format";

export default function App() {
  const { isConnected } = useAccount();
  const listRef = useRef<VaultListHandle>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            💎 Diamond Hands
          </h1>
          <p className="text-sm text-slate-400">
            Залочь ERC-20 и победи бумажные руки · {TARGET_CHAIN.name}
          </p>
        </div>
        <ConnectButton />
      </header>

      {!isConnected ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <p className="text-lg text-slate-300">
            Подключи кошелёк, чтобы создавать и управлять Vault'ами.
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
