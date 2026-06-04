import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import type { Address } from "viem";
import type { Vault } from "./types";
import { DAY, fmtNum, currentPenaltyPct, shortAddr } from "./lib/helpers";
import { useTick } from "./lib/useTick";
import { MOCK_VAULTS, MOCK_TOKENS } from "./lib/mock";
import { CHAIN_ID, explorerTx } from "./web3/contracts";
import { FARCASTER_CONNECTOR_ID } from "./web3/config";
import { useVaults } from "./web3/useVaults";
import { useTokens } from "./web3/useTokens";
import { useVaultActions } from "./web3/useVaultActions";
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
  if (!tx) return null;
  const { stage, title, sub, hash, error, errorKind } = tx;
  const done = stage === "success";
  const isErr = stage === "error";

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
            <Button className="w-full mt-6" onClick={onClose}>
              Done
            </Button>
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

const randAddr = () =>
  ("0x" +
    Math.random().toString(16).slice(2, 6) +
    Math.random().toString(16).slice(2, 38)) as Address;

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
  return (
    <div className="px-6 pt-10 pb-32">
      <div className="rounded-2xl bg-surface border border-line p-8 text-center">
        <div className="mx-auto mb-4 grid place-items-center w-12 h-12 rounded-full bg-[#F59E0B14] text-warning">
          <Icon name="info" size={26} />
        </div>
        <h1 className="text-[22px] font-bold text-ink leading-tight">Wrong network</h1>
        <p className="mt-2 text-[15px] text-sub leading-relaxed text-balance">
          Diamond Hands runs on Base Sepolia. Switch your wallet to continue.
        </p>
        <Button className="w-full mt-6" loading={switching} onClick={onSwitch}>
          <Icon name="refresh" size={18} />
          Switch to Base Sepolia
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

  // Embedded in the Base App → full-bleed (drop the desktop phone-frame shell).
  useEffect(() => {
    document.body.classList.toggle("dh-embed", inMiniApp);
  }, [inMiniApp]);

  // data source: live on-chain reads, or the mock prototype (demo toggle)
  const [demo, setDemo] = useState(false); // prototype only
  const live = useVaults(!demo && isConnected && !wrongNetwork ? address : undefined);
  const liveTokens = useTokens(!demo && isConnected && !wrongNetwork ? address : undefined);
  const [mock, setMock] = useState<Vault[]>(MOCK_VAULTS); // demo data + mock writes

  const [screen, setScreen] = useState<"dashboard" | "create" | "vault">("dashboard");
  const [activeId, setActiveId] = useState<Address | null>(null);
  const [emergency, setEmergency] = useState<Vault | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; kind: "topup" | "extend" | null; v: Vault | null }>({
    open: false,
    kind: null,
    v: null,
  });
  const [tx, setTx] = useState<TxState>(null);
  const actions = useVaultActions(setTx, live.refetch);

  const source = demo ? mock : live.vaults;
  const activeVault = source.find((v) => v.address === activeId);

  // is the dashboard showing a real list (vs. a gate/loading/error state)?
  const dashReady = demo || (isConnected && !wrongNetwork && !live.isLoading && !live.isError);
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

  // mock async tx runner — drives the same overlay as the live flow.
  // DEMO MODE ONLY: live mode uses useVaultActions (real writeContract).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runTx = (cfg: any) => {
    const { steps, fail, onDone } = cfg;
    let i = 0;
    const hash = "0x" + Array.from({ length: 64 }, () => ((Math.random() * 16) | 0).toString(16)).join("");
    const step = () => {
      if (fail && i === (fail.at ?? steps.length - 1)) {
        setTimeout(
          () =>
            setTx({
              stage: "error",
              ...failMsg(fail.kind),
              errorKind: fail.kind,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              _retry: () => {
                const { fail: _f, ...rest } = cfg;
                runTx(rest);
              },
            }),
          900,
        );
        return;
      }
      if (i >= steps.length) {
        setTx({ stage: "pending", title: "Transaction on-chain…", sub: "Confirming a block on Base", hash });
        setTimeout(() => {
          setTx({ stage: "success", ...cfg.success, hash });
          onDone && onDone();
        }, 1600);
        return;
      }
      setTx({ stage: "wallet", ...steps[i], hash });
      i++;
      setTimeout(step, 1300);
    };
    step();
  };

  const failMsg = (kind: string) =>
    ({
      rejected: {
        title: "Signature rejected",
        error: "You rejected the transaction in your wallet. Nothing was charged — you can try again.",
      },
      gas: {
        title: "Not enough gas",
        error: "Not enough ETH for gas on Base. Top up and try again.",
      },
      approve: {
        title: "Approve needed",
        error: "Token access isn't approved yet. Approve first, then lock.",
      },
    })[kind] || { title: "Something went wrong", error: "The transaction failed. Try again." };

  // ── action dispatch (demo = mock runner; live = real writes) ──
  const onCreateSubmit = (form: CreateForm) => {
    setScreen("dashboard");
    if (!demo) {
      actions.createVault(form);
      return;
    }
    const steps: Array<{ title: string; sub: string }> = [];
    if (form.needsApprove)
      steps.push({ title: `Approve access to ${form.token.sym}`, sub: "Confirm the approve in your wallet" });
    steps.push({ title: "Confirm the lock", sub: "Open your wallet and sign" });
    runTx({
      steps,
      success: { title: "Vault created 💎", sub: `${fmtNum(form.amount)} ${form.token.sym} locked for ${form.days} days` },
      onDone: () => {
        const fresh: Vault = {
          address: randAddr(),
          token: form.token,
          amount: form.amount,
          mode: form.mode,
          startPenalty: form.penalty,
          start: Date.now(),
          unlock: Date.now() + form.days * DAY,
          status: "active",
          currentPenalty: form.penalty ?? 0,
          checkIns: 0,
          lastCheckIn: 0,
        };
        setMock((vs) => [fresh, ...vs]);
      },
    });
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
      if (!demo) {
        actions.checkIn(v);
        return;
      }
      setMock((vs) =>
        vs.map((x) => (x.address === v.address ? { ...x, checkIns: (x.checkIns ?? 0) + 1, lastCheckIn: Date.now() } : x)),
      );
      return;
    }
    if (kind === "withdraw") {
      if (!demo) {
        actions.withdraw(v).then((ok) => ok && setScreen("dashboard"));
        return;
      }
      runTx({
        steps: [{ title: "Confirm withdrawal", sub: "Sign the withdrawal in your wallet" }],
        success: { title: "Withdrawn ✓", sub: `${fmtNum(v.amount)} ${v.token.sym} in your wallet` },
        onDone: () => {
          setMock((vs) => vs.map((x) => (x.address === v.address ? { ...x, status: "withdrawn" } : x)));
          setScreen("dashboard");
        },
      });
    }
  };

  const confirmSheet = (kind: "topup" | "extend", v: Vault, num: number) => {
    setSheet({ open: false, kind: null, v: null });
    if (!demo) {
      if (kind === "topup") actions.topUp(v, num);
      else actions.extendLock(v, num);
      return;
    }
    runTx({
      steps: [{ title: kind === "topup" ? "Confirm top-up" : "Confirm extension", sub: "Sign in your wallet" }],
      success:
        kind === "topup"
          ? { title: "Topped up ✓", sub: `+${fmtNum(num)} ${v.token.sym} in the vault` }
          : { title: "Term extended ✓", sub: `+${num} days added` },
      onDone: () => {
        setMock((vs) =>
          vs.map((x) =>
            x.address === v.address
              ? kind === "topup"
                ? { ...x, amount: x.amount + num }
                : { ...x, unlock: x.unlock + num * DAY }
              : x,
          ),
        );
      },
    });
  };

  const confirmEmergency = (v: Vault) => {
    setEmergency(null);
    if (!demo) {
      actions.emergencyWithdraw(v).then((ok) => ok && setScreen("dashboard"));
      return;
    }
    const pen = currentPenaltyPct(v, now);
    const receive = v.amount * (1 - pen / 100);
    runTx({
      steps: [{ title: "Confirm early exit", sub: "Sign the penalized transaction" }],
      success: { title: "Exit done", sub: `Received ${fmtNum(receive)} ${v.token.sym} (penalty ${pen.toFixed(1)}%)` },
      onDone: () => {
        setMock((vs) => vs.map((x) => (x.address === v.address ? { ...x, status: "withdrawn" } : x)));
        setScreen("dashboard");
      },
    });
  };

  const retry = () => {
    const r = tx?._retry;
    setTx(null);
    r?.();
  };

  return (
    <div className="dh-phone font-sans">
      {/* iOS status bar — dev shell only; the Base App provides the real one */}
      {!inMiniApp && (
        <div className="h-[26px] px-6 flex items-center justify-between text-[12px] font-semibold text-ink shrink-0 select-none">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
              <rect x="0" y="6" width="3" height="5" rx="1" />
              <rect x="4.5" y="4" width="3" height="7" rx="1" />
              <rect x="9" y="2" width="3" height="9" rx="1" />
              <rect x="13.5" y="0" width="3" height="11" rx="1" />
            </svg>
            <svg width="24" height="11" viewBox="0 0 24 11" fill="none">
              <rect x=".5" y=".5" width="20" height="10" rx="3" stroke="currentColor" opacity=".4" />
              <rect x="2" y="2" width="16" height="7" rx="1.5" fill="currentColor" />
              <rect x="21.5" y="3.5" width="1.5" height="4" rx=".75" fill="currentColor" opacity=".4" />
            </svg>
          </span>
        </div>
      )}

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
        {demo ? (
          <div className="flex items-center gap-1.5 rounded-full bg-surface border border-line pl-2 pr-2.5 h-8">
            <span className="w-4 h-4 rounded-full" style={{ background: "linear-gradient(135deg,#3D3DFF,#0000FF)" }} />
            <span className="text-[12px] font-semibold text-ink tabular-nums">0x7a…c4</span>
          </div>
        ) : isConnected ? (
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
          (demo ? (
            <Dashboard vaults={mock} now={now} onOpen={openVault} onCreate={() => setScreen("create")} />
          ) : !isConnected ? (
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
            tokens={demo ? MOCK_TOKENS : liveTokens}
          />
        )}
        {screen === "vault" && activeVault && (
          <VaultDetail v={activeVault} now={now} onBack={() => setScreen("dashboard")} onAction={onVaultAction} />
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

      {/* demo toggle (prototype/dev only — hidden inside the Base App) */}
      {!inMiniApp && screen === "dashboard" && (
        <button
          onClick={() => setDemo((d) => !d)}
          className="absolute top-1 left-1/2 -translate-x-1/2 z-50 text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-ink/70 text-white/90 backdrop-blur"
        >
          {demo ? "◍ demo data" : "◍ live"}
        </button>
      )}

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
