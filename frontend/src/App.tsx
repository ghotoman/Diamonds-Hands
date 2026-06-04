import { useState } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import type { Address } from "viem";
import type { Vault } from "./types";
import { DAY, fmtNum, currentPenaltyPct, shortAddr } from "./lib/helpers";
import { useTick } from "./lib/useTick";
import { MOCK_VAULTS } from "./lib/mock";
import { CHAIN_ID } from "./web3/contracts";
import { FARCASTER_CONNECTOR_ID } from "./web3/config";
import { useVaults } from "./web3/useVaults";
import { Icon } from "./components/Icon";
import { Logo } from "./components/Logo";
import { Button } from "./components/Button";
import { Spinner } from "./components/Spinner";
import { Dashboard } from "./screens/Dashboard";
import { CreateFlow, type CreateForm } from "./screens/CreateFlow";
import { VaultDetail, EmergencyModal, ActionSheet, type ActionKind } from "./screens/VaultDetail";

// ── Transaction overlay: wallet → pending → success | error ──
type TxStage = "wallet" | "pending" | "success" | "error";
type TxState = {
  stage: TxStage;
  title: string;
  sub?: string;
  hash?: string;
  error?: string;
  errorKind?: "rejected" | "gas" | "approve" | "generic";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _cfg?: any;
} | null;

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
                tx {hash} · Base
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
            <a href="#" onClick={(e) => e.preventDefault()} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-baseblue">
              {hash} on BaseScan
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

function LoadingState() {
  return (
    <div className="px-6 pt-24 flex flex-col items-center text-center">
      <Spinner size={40} />
      <p className="mt-4 text-[14px] text-sub">Loading your vaults…</p>
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

  // wallet / network
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  // data source: live on-chain reads, or the mock prototype (demo toggle)
  const [demo, setDemo] = useState(false); // prototype only
  const live = useVaults(!demo && isConnected && !wrongNetwork ? address : undefined);
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
    const pick =
      connectors.find((c) => c.id === "coinbaseWalletSDK") ??
      connectors.find((c) => c.id === "injected") ??
      connectors.find((c) => c.id !== FARCASTER_CONNECTOR_ID);
    if (pick) connect({ connector: pick });
  };

  // mock async tx runner — shaped like a future viem writeContract flow.
  // prototype only: replaced by real wagmi/viem writes in Stage 4.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runTx = (cfg: any) => {
    const { steps, fail, onDone } = cfg;
    let i = 0;
    const hash = "0x" + Math.random().toString(16).slice(2, 6) + "…" + Math.random().toString(16).slice(2, 6);
    const step = () => {
      if (fail && i === (fail.at ?? steps.length - 1)) {
        setTimeout(() => setTx({ stage: "error", ...failMsg(fail.kind), errorKind: fail.kind, _cfg: cfg }), 900);
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

  // after a (mock) tx settles, refresh the live reads so on-chain truth wins.
  const afterTx = () => {
    if (!demo) live.refetch();
  };

  // ── action dispatch ──
  const onCreateSubmit = (form: CreateForm) => {
    setScreen("dashboard");
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
        afterTx();
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
      setMock((vs) =>
        vs.map((x) => (x.address === v.address ? { ...x, checkIns: (x.checkIns ?? 0) + 1, lastCheckIn: Date.now() } : x)),
      );
      afterTx();
      return;
    }
    if (kind === "withdraw") {
      runTx({
        steps: [{ title: "Confirm withdrawal", sub: "Sign the withdrawal in your wallet" }],
        success: { title: "Withdrawn ✓", sub: `${fmtNum(v.amount)} ${v.token.sym} in your wallet` },
        onDone: () => {
          setMock((vs) => vs.map((x) => (x.address === v.address ? { ...x, status: "withdrawn" } : x)));
          afterTx();
          setScreen("dashboard");
        },
      });
    }
  };

  const confirmSheet = (kind: "topup" | "extend", v: Vault, num: number) => {
    setSheet({ open: false, kind: null, v: null });
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
        afterTx();
      },
    });
  };

  const confirmEmergency = (v: Vault) => {
    setEmergency(null);
    const pen = currentPenaltyPct(v, now);
    const receive = v.amount * (1 - pen / 100);
    runTx({
      steps: [{ title: "Confirm early exit", sub: "Sign the penalized transaction" }],
      success: { title: "Exit done", sub: `Received ${fmtNum(receive)} ${v.token.sym} (penalty ${pen.toFixed(1)}%)` },
      onDone: () => {
        setMock((vs) => vs.map((x) => (x.address === v.address ? { ...x, status: "withdrawn" } : x)));
        afterTx();
        setScreen("dashboard");
      },
    });
  };

  const retry = () => {
    const cfg = tx?._cfg;
    setTx(null);
    if (cfg) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { fail, ...rest } = cfg;
      runTx(rest);
    }
  };

  return (
    <div className="dh-phone font-sans">
      {/* iOS status bar */}
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
        {screen === "create" && <CreateFlow onCancel={() => setScreen("dashboard")} onSubmit={onCreateSubmit} />}
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

      {/* demo toggle (prototype only) */}
      {screen === "dashboard" && (
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
