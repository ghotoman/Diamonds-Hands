import { useState } from "react";
import { isAddress, parseUnits, type Address } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { erc20Abi } from "../abis/erc20";
import { factoryAbi } from "../abis/factory";
import {
  ABS_MAX_PENALTY_BPS,
  FACTORY_ADDRESS,
  MIN_USER_PENALTY_BPS,
} from "../lib/addresses";
import { daysToSeconds, nowSec } from "../lib/format";

const PENALTY_PRESETS = [1000, 2000, 3000];

export function CreateVaultForm({ onCreated }: { onCreated: () => void }) {
  const { address } = useAccount();
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [lockDays, setLockDays] = useState(30);
  const [soft, setSoft] = useState(true);
  const [penaltyBps, setPenaltyBps] = useState(2000);

  const tokenValid = isAddress(token);
  const tokenAddr = tokenValid ? (token as Address) : undefined;

  const { data: decimals } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: !!tokenAddr },
  });

  const { data: symbol } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: "symbol",
    query: { enabled: !!tokenAddr },
  });

  const dec = decimals ?? 18;
  let amountWei: bigint | undefined;
  try {
    amountWei = amount ? parseUnits(amount, dec) : undefined;
  } catch {
    amountWei = undefined;
  }

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && tokenAddr ? [address, FACTORY_ADDRESS] : undefined,
    query: { enabled: !!address && !!tokenAddr },
  });

  const needsApprove =
    amountWei !== undefined && (allowance === undefined || allowance < amountWei);

  // --- approve ---
  const approve = useWriteContract();
  const approveRcpt = useWaitForTransactionReceipt({ hash: approve.data });
  if (approveRcpt.isSuccess && allowance !== undefined && needsApprove) {
    // refresh allowance after confirmation
    void refetchAllowance();
  }

  // --- createVault ---
  const create = useWriteContract();
  const createRcpt = useWaitForTransactionReceipt({ hash: create.data });
  if (createRcpt.isSuccess) {
    queueMicrotask(onCreated);
  }

  const lockValid = lockDays >= 7 && lockDays <= 1825;
  const penaltyValid =
    !soft || (penaltyBps >= MIN_USER_PENALTY_BPS && penaltyBps <= ABS_MAX_PENALTY_BPS);
  const formValid =
    tokenValid && !!amountWei && amountWei > 0n && lockValid && penaltyValid;

  function doApprove() {
    if (!tokenAddr || amountWei === undefined) return;
    approve.writeContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: "approve",
      args: [FACTORY_ADDRESS, amountWei],
    });
  }

  function doCreate() {
    if (!tokenAddr || amountWei === undefined) return;
    const unlock = nowSec() + daysToSeconds(lockDays);
    create.writeContract({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: "createVault",
      args: [tokenAddr, amountWei, unlock, soft, soft ? penaltyBps : 0],
    });
  }

  const input =
    "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-sky-500";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="mb-4 text-lg font-semibold text-slate-100">Create a Vault</h2>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-400">
            ERC-20 token (address)
          </span>
          <input
            className={input}
            placeholder="0x…"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
          />
          {token && !tokenValid && (
            <span className="text-xs text-rose-400">Invalid address</span>
          )}
          {symbol && (
            <span className="text-xs text-slate-500">
              Token: {symbol} ({dec} dec)
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-400">Amount</span>
          <input
            className={input}
            placeholder="100"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.trim())}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-400">
            Lock duration: {lockDays} days
          </span>
          <input
            type="range"
            min={7}
            max={1825}
            value={lockDays}
            onChange={(e) => setLockDays(Number(e.target.value))}
            className="w-full accent-sky-500"
          />
          <span className="text-xs text-slate-500">from 7 days to 5 years</span>
        </label>

        <div className="flex gap-2">
          <button
            onClick={() => setSoft(true)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              soft ? "bg-sky-500 text-slate-900" : "bg-slate-800 text-slate-300"
            }`}
          >
            Soft (with penalty)
          </button>
          <button
            onClick={() => setSoft(false)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              !soft ? "bg-sky-500 text-slate-900" : "bg-slate-800 text-slate-300"
            }`}
          >
            Hard (no early exit)
          </button>
        </div>

        {soft && (
          <div>
            <span className="mb-1 block text-sm text-slate-400">
              Penalty hardness (start)
            </span>
            <div className="flex gap-2">
              {PENALTY_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPenaltyBps(p)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                    penaltyBps === p
                      ? "bg-sky-500 text-slate-900"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {p / 100}%
                </button>
              ))}
            </div>
          </div>
        )}

        {needsApprove ? (
          <button
            onClick={doApprove}
            disabled={!formValid || approve.isPending || approveRcpt.isLoading}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-50"
          >
            {approve.isPending || approveRcpt.isLoading
              ? "Approving…"
              : `Approve ${symbol ?? "token"}`}
          </button>
        ) : (
          <button
            onClick={doCreate}
            disabled={!formValid || create.isPending || createRcpt.isLoading}
            className="w-full rounded-lg bg-sky-500 px-4 py-2.5 font-semibold text-slate-900 hover:bg-sky-400 disabled:opacity-50"
          >
            {create.isPending || createRcpt.isLoading ? "Creating…" : "Create Vault"}
          </button>
        )}

        {(approve.error || create.error) && (
          <p className="text-xs text-rose-400">
            {(approve.error ?? create.error)?.message.slice(0, 160)}
          </p>
        )}
      </div>
    </div>
  );
}
