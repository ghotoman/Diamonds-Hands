import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { TARGET_CHAIN } from "../lib/addresses";
import { FARCASTER_CONNECTOR_ID } from "../wagmi";
import { shortAddr } from "../lib/format";

/// Wallet connect button + network gate (Base Sepolia).
export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, status } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    // Hide the Farcaster connector from the manual list: inside the Base App
    // MiniKit auto-connects it; standalone web uses injected / Coinbase.
    const manual = connectors.filter((c) => c.id !== FARCASTER_CONNECTOR_ID);
    return (
      <div className="flex flex-wrap gap-2">
        {manual.map((c) => (
          <button
            key={c.uid}
            onClick={() => connect({ connector: c })}
            disabled={status === "pending"}
            className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-slate-900 hover:bg-sky-400 disabled:opacity-50"
          >
            {c.name}
          </button>
        ))}
      </div>
    );
  }

  const wrongNetwork = chainId !== TARGET_CHAIN.id;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {wrongNetwork ? (
        <button
          onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}
          className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-slate-900 hover:bg-amber-400"
        >
          Switch to {TARGET_CHAIN.name}
        </button>
      ) : (
        <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300">
          {TARGET_CHAIN.name}
        </span>
      )}
      <span className="font-mono text-sm text-slate-300">{shortAddr(address)}</span>
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
      >
        Disconnect
      </button>
    </div>
  );
}
