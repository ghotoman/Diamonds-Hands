import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { useComposeCast, useIsInMiniApp, useMiniKit } from "@coinbase/onchainkit/minikit";
import type { Address } from "viem";
import type { Vault } from "./types";
import { shortAddr } from "./lib/helpers";
import { useTick } from "./lib/useTick";
import { CHAIN_ID, TARGET_CHAIN, explorerTx } from "./web3/contracts";
import { FARCASTER_CONNECTOR_ID } from "./web3/config";
import { useVaults } from "./web3/useVaults";
import { useTokens } from "./web3/useTokens";
import { useVaultActions } from "./web3/useVaultActions";
import { useVaultEvents } from "./web3/useVaultEvents";
import type { TxState } from "./web3/tx";
import { Icon } from "./components/Icon";
import { Logo } from "./components/Logo";
import { Button } from "./components/Button";
import { Spinner } from "./components/Spinner";
import { Dashboard } from "./screens/Dashboard";
import { CreateFlow, type CreateForm } from "./screens/CreateFlow";
import { VaultDetail, EmergencyModal, ActionSheet, type ActionKind } from "./screens/VaultDetail";

// ── Transaction overlay: wallet → pending → success | error ──
function TxOverlay({ tx, onClose, onRetry }: { tx: TxState; onClose: () => void; onRetry: () => void }) {
  const { composeCast } = useComposeCast();
  const { isInMiniApp } = useIsInMiniApp();
  if (!tx) return null;
  const { stage, title, sub, hash, error, errorKind, share } = tx;
  const done = stage === "success";
  const isErr = stage === "error";
  const canShare = done && !!share;
  // Inside the Base App / Mini App use the native composer; otherwise (or when
  // the SDK check is still resolving) fall back to the Warpcast compose URL so
  // the Share button always does *something* useful.
  const onShare = () => {
    if (!share) return;
    if (isInMiniApp === true) {
      composeCast(share);
      return;
    }
    const params = new URLSearchParams();
    params.set("text", share.text);
    (share.embeds ?? []).forEach((e) => params.append("embeds[]", e));
    window.open(`https://warpcast.com/~/compose?${params.toString()}`, "_blank", "noopener");
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={done || isErr ? onClose : undefined} />
      <div className="relative w-full bg-white rounded-t-[24px] shadow-modal px-6 pt-7 pb-7 text-center animate-[sheet_.24s_cubic-bezier(.2,.8,.2,1)]">
        {!done && !isErr && (
          <>
            <div className="mx-auto mb-4 inline-block">
              <Spinner size={48} />
            </div>
            <h2 className="text-[20px] font-bold text-ink">{title}</h2>
            <p className="mt-1.5 text-[14px] text-sub leading-snug">{sub}</p>
            {stage === "pending" && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-[12px] text-sub">
                <span className="w-1.5 h-1.5 rounded-full bg-baseblue animate-pulse" />
                tx {shortAddr(hash)} · Base
              </div>
            )}
          </>
        )}
        {done && (
          <>
            <div className="mx-auto mb-4 grid place-items-center w-16 h-16 rounded-full bg-[#00B3410F]">
              <span className="grid place-items-center w-12 h-12 rounded-full bg-success text-white animate-[pop_.3s_ease-out]">
                <Icon name="check" size={30} stroke={2.8} />
              </span>
            </div>
            <h2 className="text-[20px] font-bold text-ink">{title}</h2>
            <p className="mt-1.5 text-[14px] text-sub">{sub}</p>
            <a
              href={hash ? explorerTx(hash) : "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-baseblue"
            >
              {shortAddr(hash)} on BaseScan
              <Icon name="external" size={15} />
            </a>
            {canShare ? (
              <>
                <Button className="w-full mt-6" onClick={onShare}>
                  <Icon name="spark" size={18} />
                  Share
                </Button>
                <Button variant="ghost" className="w-full mt-2 text-sub" onClick={onClose}>
                  Done
                </Button>
              </>
            ) : (
              <Button className="w-full mt-6" onClick={onClose}>
                Done
              </Button>
            )}
          </>
        )}
        {isErr && (
          <>
            <div className="mx-auto mb-4 grid place-items-center w-16 h-16 rounded-full bg-[#E11D480F]">
              <span className="grid place-items-center w-12 h-12 rounded-full bg-danger text-white">
                <Icon name="x" size={28} stroke={2.8} />
              </span>
            </div>
            <h2 className="text-[20px] font-bold text-ink">{title}</h2>
            <p className="mt-1.5 text-[14px] text-sub leading-snug">{error}</p>
            <div className="mt-6 flex flex-col gap-2.5">
              {errorKind !== "rejected" && (
                <Button className="w-full" onClick={onRetry}>
                  <Icon name="refresh" size={18} />
                  Try again
                </Button>
              )}
              <Button variant={errorKind === "rejected" ? "primary" : "ghost"} className="w-full" onClick={onClose}>
                {errorKind === "rejected" ? "Got it" : "Cancel"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Dashboard data states (live mode) ──────────────────────────────────────
function ConnectGate({ onConnect, connecting }: { onConnect: () => void; connecting: boolean }) {
  return (
    <div className="px-6 pt-10 pb-32">
      <div className="rounded-2xl bg-surface border border-line p-8 text-center">
        <div className="mx-auto mb-5 grid place-items-center">
          <Logo size={56} />
        </div>
        <h1 className="text-[24px] font-bold text-ink leading-tight tracking-tight">Connect your wallet</h1>
        <p className="mt-3 text-[15px] text-sub leading-relaxed text-balance">
          Diamond Hands reads your vaults straight from Base. Connect to see what you've locked.
        </p>
        <Button className="w-full mt-7" loading={connecting} onClick={onConnect}>
          <Icon name="spark" size={18} />
          Connect wallet
        </Button>
      </div>
    </div>
  );
}

function SwitchPrompt({ onSwitch, switching }: { onSwitch: () => void; switching: boolean }) {
  const name = TARGET_CHAIN.name;
  return (
    <div className="px-6 pt-10 pb-32">
      <div className="rounded-2xl bg-surface border border-line p-8 text-center">
        <div className="mx-auto mb-4 grid place-items-center w-12 h-12 rounded-full bg-[#F59E0B14] text-warning">
          <Icon name="info" size={26} />
        </div>
        <h1 className="text-[22px] font-bold text-ink leading-tight">Wrong network</h1>
        <p className="mt-2 text-[15px] text-sub leading-relaxed text-balance">
          Diamond Hands runs on {name}. Switch your wallet to continue.
        </p>
        <Button className="w-full mt-6" loading={switching} onClick={onSwitch}>
          <Icon name="refresh" size={18} />
          Switch to {name}
        </Button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white border border-line p-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-line" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-20 rounded bg-line" />
          <div className="h-3 w-14 rounded bg-surface" />
        </div>
        <div className="h-6 w-16 rounded bg-line" />
      </div>
      <div className="mt-5 h-2 w-full rounded-full bg-line" />
      <div className="mt-3 flex justify-between">
        <div className="h-3 w-24 rounded bg-surface" />
        <div className="h-3 w-16 rounded bg-surface" />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="pb-32 animate-pulse">
      <div className="px-5 pt-4">
        <div className="h-3 w-24 rounded bg-line" />
        <div className="mt-2 h-10 w-44 rounded-lg bg-line" />
        <div className="mt-3 flex gap-2">
          <div className="h-7 w-24 rounded-full bg-surface" />
          <div className="h-7 w-28 rounded-full bg-surface" />
        </div>
      </div>
      <div className="mt-6 px-5 flex flex-col gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-6 pt-10 pb-32">
      <div className="rounded-2xl bg-surface border border-line p-8 text-center">
        <div className="mx-auto mb-4 grid place-items-center w-12 h-12 rounded-full bg-[#E11D4814] text-danger">
          <Icon name="info" size={26} />
        </div>
        <h1 className="text-[20px] font-bold text-ink leading-tight">Couldn't load your vaults</h1>
        <p className="mt-2 text-[14px] text-sub leading-relaxed text-balance">
          The Base RPC didn't answer. Check your connection and try again.
        </p>
        <Button className="w-full mt-6" variant="secondary" onClick={onRetry}>
          <Icon name="refresh" size={18} />
          Retry
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const now = useTick(1000);

  // Base App: signal the Mini App is ready so the host dismisses its splash.
  // No-op outside the Base App.
  const { setMiniAppReady, isMiniAppReady, context } = useMiniKit();
  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [isMiniAppReady, setMiniAppReady]);

  // wallet / network
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  // Inside the Base App the wallet IS the Farcaster Mini App connector —
  // auto-connect it once (wagmi doesn't auto-connect on its own).
  const inMiniApp = !!context;
  const autoConnected = useRef(false);
  useEffect(() => {
    if (!inMiniApp || isConnected || autoConnected.current) return;
    const fc = connectors.find((c) => c.id === FARCASTER_CONNECTOR_ID);
    if (fc) {
      autoConnected.current = true;
      connect({ connector: fc });
    }
  }, [inMiniApp, isConnected, connectors, connect]);

  // data source: live on-chain reads
  const live = useVaults(isConnected && !wrongNetwork ? address : undefined);
  const liveTokens = useTokens(isConnected && !wrongNetwork ? address : undefined);

  const [screen, setScreen] = useState<"dashboard" | "create" | "vault">("dashboard");
  const [activeId, setActiveId] = useState<Address | null>(null);
  const [emergency, setEmergency] = useState<Vault | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; kind: "topup" | "extend" | null; v: Vault | null }>({
    open: false,
    kind: null,
    v: null,
  });
  const [tx, setTx] = useState<TxState>(null);

  const source = live.vaults;
  const activeVault = source.find((v) => v.address === activeId);

  // Streak / last-check-in indexed from on-chain CheckedIn events (live only).
  const liveEvents = useVaultEvents(activeVault);

  const actions = useVaultActions(setTx, () => {
    live.refetch();
    liveEvents.refetch();
  });
  const renderVault = useMemo(() => {
    if (!activeVault) return undefined;
    if (liveEvents.isLoading) return activeVault;
    // RPC can't serve logs (degraded/error) → the streak is UNKNOWN, not zero.
    // VaultDetail renders "Streak unavailable" for that, so a true
    // "0 check-ins in a row" can only mean "no events on-chain".
    const unknown = liveEvents.degraded || liveEvents.isError;
    return {
      ...activeVault,
      checkIns: unknown ? undefined : liveEvents.checkIns,
      lastCheckIn: unknown ? undefined : liveEvents.lastCheckIn,
      streakUnavailable: unknown,
    };
  }, [activeVault, liveEvents]);

  // is the dashboard showing a real list (vs. a gate/loading/error state)?
  const dashReady = isConnected && !wrongNetwork && !live.isLoading && !live.isError;
  const showCreateCta = screen === "dashboard" && dashReady && source.length > 0;

  const openVault = (id: string) => {
    setActiveId(id as Address);
    setScreen("vault");
  };

  const onConnect = () => {
    const byId = (id: string) => connectors.find((c) => c.id === id);
    // browser: prefer an installed extension (MetaMask / Coinbase ext) over
    // the Coinbase smart-wallet popup; fall back to it when no provider exists.
    const hasInjected = typeof window !== "undefined" && "ethereum" in window;
    const pick = inMiniApp
      ? byId(FARCASTER_CONNECTOR_ID)
      : hasInjected
        ? (byId("injected") ?? byId("coinbaseWalletSDK"))
        : (byId("coinbaseWalletSDK") ?? byId("injected"));
    if (pick) connect({ connector: pick });
  };

  // ── action dispatch (live writes via useVaultActions) ──
  const onCreateSubmit = (form: CreateForm) => {
    setScreen("dashboard");
    actions.createVault(form);
  };

  const onVaultAction = (kind: ActionKind, v: Vault) => {
    if (kind === "emergency") {
      setEmergency(v);
      return;
    }
    if (kind === "topup" || kind === "extend") {
      setSheet({ open: true, kind, v });
      return;
    }
    if (kind === "checkin") {
      actions.checkIn(v);
      return;
    }
    if (kind === "withdraw") {
      actions.withdraw(v).then((ok) => ok && setScreen("dashboard"));
    }
  };

  const confirmSheet = (kind: "topup" | "extend", v: Vault, num: number) => {
    setSheet({ open: false, kind: null, v: null });
    if (kind === "topup") actions.topUp(v, num);
    else actions.extendLock(v, num);
  };

  const confirmEmergency = (v: Vault) => {
    setEmergency(null);
    actions.emergencyWithdraw(v).then((ok) => ok && setScreen("dashboard"));
  };

  const retry = () => {
    const r = tx?._retry;
    setTx(null);
    r?.();
  };

  return (
    <div className="dh-phone font-sans">
      {/* Base App host bar */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-line shrink-0 bg-white/80 backdrop-blur">
        <button
          onClick={() => {
            setScreen("dashboard");
            setActiveId(null);
          }}
          className="flex items-center gap-2 px-1"
        >
          <Logo size={26} />
          <span className="text-[16px] font-bold text-ink tracking-tight">Diamond Hands</span>
        </button>
        {isConnected ? (
          <div className="flex items-center gap-1.5 rounded-full bg-surface border border-line pl-2 pr-2.5 h-8">
            <span
              className="w-4 h-4 rounded-full"
              style={{ background: wrongNetwork ? "#F59E0B" : "linear-gradient(135deg,#3D3DFF,#0000FF)" }}
            />
            <span className="text-[12px] font-semibold text-ink tabular-nums">{shortAddr(address)}</span>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={connecting}
            className="flex items-center gap-1.5 rounded-full bg-baseblue text-white px-3 h-8 text-[12px] font-semibold disabled:opacity-60"
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
        )}
      </div>

      {/* scrollable app surface */}
      <div className="dh-surface flex-1 overflow-y-auto relative bg-white">
        {screen === "dashboard" &&
          (!isConnected ? (
            <ConnectGate onConnect={onConnect} connecting={connecting} />
          ) : wrongNetwork ? (
            <SwitchPrompt onSwitch={() => switchChain({ chainId: CHAIN_ID })} switching={switching} />
          ) : live.isLoading ? (
            <LoadingState />
          ) : live.isError ? (
            <ErrorState onRetry={live.refetch} />
          ) : (
            <Dashboard vaults={live.vaults} now={now} onOpen={openVault} onCreate={() => setScreen("create")} />
          ))}
        {screen === "create" && (
          <CreateFlow
            onCancel={() => setScreen("dashboard")}
            onSubmit={onCreateSubmit}
            tokens={liveTokens}
            allowCustom
          />
        )}
        {screen === "vault" && renderVault && (
          <VaultDetail v={renderVault} now={now} onBack={() => setScreen("dashboard")} onAction={onVaultAction} />
        )}

        {/* sticky create CTA on dashboard */}
        {showCreateCta && (
          <div className="sticky bottom-0 px-5 pb-4 pt-6 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
            <Button className="w-full pointer-events-auto" onClick={() => setScreen("create")}>
              <Icon name="plus" size={20} stroke={2.4} />
              Create Vault
            </Button>
          </div>
        )}
      </div>

      <EmergencyModal open={!!emergency} v={emergency} now={now} onClose={() => setEmergency(null)} onConfirm={confirmEmergency} />
      <ActionSheet
        open={sheet.open}
        kind={sheet.kind}
        v={sheet.v}
        onClose={() => setSheet({ open: false, kind: null, v: null })}
        onConfirm={confirmSheet}
      />
      <TxOverlay tx={tx} onClose={() => setTx(null)} onRetry={retry} />
    </div>
  );
}
