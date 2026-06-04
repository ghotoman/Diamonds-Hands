import { useEffect, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import {
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { erc20Abi } from "../abis/erc20";
import { vaultAbi } from "../abis/vault";
import { bpsToPercent, formatTimestamp, humanDuration } from "../lib/format";

const vaultContract = <T extends string>(address: Address, functionName: T) =>
  ({ address, abi: vaultAbi, functionName }) as const;

export function VaultCard({
  vault,
  owner,
  onChanged,
}: {
  vault: Address;
  owner: Address;
  onChanged: () => void;
}) {
  const { data, refetch } = useReadContracts({
    contracts: [
      vaultContract(vault, "asset"),
      vaultContract(vault, "amount"),
      vaultContract(vault, "unlockTimestamp"),
      vaultContract(vault, "allowEarlyExit"),
      vaultContract(vault, "withdrawn"),
      vaultContract(vault, "maxPenaltyBps"),
      vaultContract(vault, "currentPenaltyBps"),
      vaultContract(vault, "currentPenaltyAmount"),
      vaultContract(vault, "timeLeft"),
    ],
  });

  const asset = data?.[0]?.result as Address | undefined;
  const amount = data?.[1]?.result as bigint | undefined;
  const unlockTs = data?.[2]?.result as bigint | undefined;
  const allowEarlyExit = data?.[3]?.result as boolean | undefined;
  const withdrawn = data?.[4]?.result as boolean | undefined;
  const maxPenaltyBps = data?.[5]?.result as bigint | undefined;
  const penaltyBps = data?.[6]?.result as bigint | undefined;
  const penaltyAmt = data?.[7]?.result as bigint | undefined;
  const timeLeft = data?.[8]?.result as bigint | undefined;

  const { data: meta } = useReadContracts({
    contracts: asset
      ? [
          { address: asset, abi: erc20Abi, functionName: "symbol" },
          { address: asset, abi: erc20Abi, functionName: "decimals" },
        ]
      : [],
    query: { enabled: !!asset },
  });
  const symbol = (meta?.[0]?.result as string | undefined) ?? "TKN";
  const decimals = (meta?.[1]?.result as number | undefined) ?? 18;

  const fmt = (v?: bigint) => (v === undefined ? "—" : formatUnits(v, decimals));

  // одно перо для write-действий Vault'а
  const action = useWriteContract();
  const actionRcpt = useWaitForTransactionReceipt({ hash: action.data });
  useEffect(() => {
    if (actionRcpt.isSuccess) {
      void refetch();
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionRcpt.isSuccess]);

  const locked = (timeLeft ?? 0n) > 0n;
  const isActive = withdrawn === false;

  const call = (functionName: "withdraw" | "emergencyWithdraw" | "checkIn") =>
    action.writeContract({ address: vault, abi: vaultAbi, functionName });

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <a
          href={`https://sepolia.basescan.org/address/${vault}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sm text-sky-400 hover:underline"
        >
          {vault.slice(0, 10)}…{vault.slice(-6)}
        </a>
        <div className="flex gap-1.5">
          <Badge tone={allowEarlyExit ? "sky" : "violet"}>
            {allowEarlyExit ? "Soft" : "Hard"}
          </Badge>
          {withdrawn ? (
            <Badge tone="slate">Закрыт</Badge>
          ) : locked ? (
            <Badge tone="amber">Залочен</Badge>
          ) : (
            <Badge tone="emerald">Разлочен</Badge>
          )}
        </div>
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row k="Сумма">
          {fmt(amount)} {symbol}
        </Row>
        <Row k="Анлок">{unlockTs ? formatTimestamp(unlockTs) : "—"}</Row>
        <Row k="Осталось">
          {timeLeft !== undefined ? humanDuration(timeLeft) : "—"}
        </Row>
        {allowEarlyExit && (
          <Row k="Штраф сейчас">
            {penaltyBps !== undefined ? bpsToPercent(penaltyBps) : "—"} (
            {fmt(penaltyAmt)} {symbol}) · max{" "}
            {maxPenaltyBps !== undefined ? bpsToPercent(maxPenaltyBps) : "—"}
          </Row>
        )}
      </dl>

      {isActive && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {!locked && (
              <ActionBtn
                onClick={() => call("withdraw")}
                pending={action.isPending || actionRcpt.isLoading}
                tone="emerald"
              >
                Withdraw 100%
              </ActionBtn>
            )}
            {locked && allowEarlyExit && (
              <ActionBtn
                onClick={() => call("emergencyWithdraw")}
                pending={action.isPending || actionRcpt.isLoading}
                tone="rose"
              >
                Exit early (−{penaltyBps !== undefined ? bpsToPercent(penaltyBps) : "?"})
              </ActionBtn>
            )}
            <ActionBtn
              onClick={() => call("checkIn")}
              pending={action.isPending || actionRcpt.isLoading}
              tone="slate"
            >
              Check-in
            </ActionBtn>
          </div>

          {locked && (
            <>
              <TopUp
                vault={vault}
                asset={asset}
                owner={owner}
                symbol={symbol}
                decimals={decimals}
                onDone={() => {
                  void refetch();
                  onChanged();
                }}
              />
              <ExtendLock vault={vault} onDone={() => void refetch()} />
            </>
          )}
        </div>
      )}

      {action.error && (
        <p className="mt-2 text-xs text-rose-400">
          {action.error.message.slice(0, 140)}
        </p>
      )}
    </div>
  );
}

// ---- topUp с approve ----
function TopUp({
  vault,
  asset,
  owner,
  symbol,
  decimals,
  onDone,
}: {
  vault: Address;
  asset?: Address;
  owner: Address;
  symbol: string;
  decimals: number;
  onDone: () => void;
}) {
  const [val, setVal] = useState("");
  let wei: bigint | undefined;
  try {
    wei = val ? parseUnits(val, decimals) : undefined;
  } catch {
    wei = undefined;
  }

  const { data: allowance, refetch: refetchAllow } = useReadContract({
    address: asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: asset ? [owner, vault] : undefined,
    query: { enabled: !!asset },
  });

  const approve = useWriteContract();
  const approveRcpt = useWaitForTransactionReceipt({ hash: approve.data });
  useEffect(() => {
    if (approveRcpt.isSuccess) void refetchAllow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveRcpt.isSuccess]);

  const topup = useWriteContract();
  const topupRcpt = useWaitForTransactionReceipt({ hash: topup.data });
  useEffect(() => {
    if (topupRcpt.isSuccess) {
      setVal("");
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupRcpt.isSuccess]);

  const needsApprove = wei !== undefined && (allowance === undefined || allowance < wei);
  const inputCls =
    "w-28 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500";

  return (
    <div className="flex items-center gap-2">
      <input
        className={inputCls}
        placeholder="top-up"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value.trim())}
      />
      {needsApprove ? (
        <ActionBtn
          onClick={() =>
            asset &&
            wei !== undefined &&
            approve.writeContract({
              address: asset,
              abi: erc20Abi,
              functionName: "approve",
              args: [vault, wei],
            })
          }
          pending={approve.isPending || approveRcpt.isLoading}
          tone="emerald"
          disabled={wei === undefined}
        >
          Approve
        </ActionBtn>
      ) : (
        <ActionBtn
          onClick={() =>
            wei !== undefined &&
            topup.writeContract({
              address: vault,
              abi: vaultAbi,
              functionName: "topUp",
              args: [wei],
            })
          }
          pending={topup.isPending || topupRcpt.isLoading}
          tone="sky"
          disabled={wei === undefined}
        >
          Top-up {symbol}
        </ActionBtn>
      )}
    </div>
  );
}

// ---- extendLock ----
function ExtendLock({ vault, onDone }: { vault: Address; onDone: () => void }) {
  const [days, setDays] = useState("30");
  const ext = useWriteContract();
  const extRcpt = useWaitForTransactionReceipt({ hash: ext.data });
  useEffect(() => {
    if (extRcpt.isSuccess) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extRcpt.isSuccess]);

  const inputCls =
    "w-28 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500";

  function doExtend() {
    const d = Number(days);
    if (!d || d <= 0) return;
    const newUnlock = BigInt(Math.floor(Date.now() / 1000) + d * 86400);
    ext.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "extendLock",
      args: [newUnlock],
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className={inputCls}
        placeholder="дней"
        inputMode="numeric"
        value={days}
        onChange={(e) => setDays(e.target.value.trim())}
      />
      <ActionBtn
        onClick={doExtend}
        pending={ext.isPending || extRcpt.isLoading}
        tone="violet"
      >
        Продлить (+дней от now)
      </ActionBtn>
    </div>
  );
}

// ---- мелкие UI-примитивы ----
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right text-slate-100">{children}</dd>
    </div>
  );
}

const toneMap: Record<string, string> = {
  sky: "bg-sky-500 text-slate-900 hover:bg-sky-400",
  emerald: "bg-emerald-500 text-slate-900 hover:bg-emerald-400",
  rose: "bg-rose-500 text-slate-900 hover:bg-rose-400",
  violet: "bg-violet-500 text-slate-900 hover:bg-violet-400",
  slate: "bg-slate-700 text-slate-100 hover:bg-slate-600",
};

const badgeTone: Record<string, string> = {
  sky: "bg-sky-500/20 text-sky-300",
  violet: "bg-violet-500/20 text-violet-300",
  amber: "bg-amber-500/20 text-amber-300",
  emerald: "bg-emerald-500/20 text-emerald-300",
  slate: "bg-slate-600/30 text-slate-300",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeTone[tone]}`}>
      {children}
    </span>
  );
}

function ActionBtn({
  onClick,
  pending,
  tone,
  disabled,
  children,
}: {
  onClick: () => void;
  pending?: boolean;
  tone: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending || disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${toneMap[tone]}`}
    >
      {pending ? "…" : children}
    </button>
  );
}
