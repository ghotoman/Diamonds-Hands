import { useCallback } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits, type Address } from "viem";
import type { Vault } from "../types";
import type { CreateForm } from "../screens/CreateFlow";
import { currentPenaltyPct, fmtNum } from "../lib/helpers";
import { FACTORY_ADDRESS, erc20Abi, factoryAbi, vaultAbi } from "./contracts";
import { DATA_SUFFIX } from "./attribution";
import { useFactoryLimits } from "./useFactoryLimits";
import { parseTxError, type SetTx, type ShareCast } from "./tx";

type Hash = `0x${string}`;
/// One signature in a flow: set the wallet stage, then `send` to get a hash.
type Step = { title: string; sub?: string; send: () => Promise<Hash> };
type Flow = { steps: Step[]; success: { title: string; sub?: string; share?: ShareCast } };

const DAY_SECONDS = 86_400;
/// Push a min-term unlock comfortably past the contract's MIN bound so it can't
/// revert with UnlockTooSoon due to client clock skew / estimation latency.
const UNLOCK_BUFFER_SEC = 600; // 10 min

/// Convert a human number to base units without exponential/precision drift.
function toUnits(n: number, decimals: number): bigint {
  const s = n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: Math.min(decimals, 20) });
  return parseUnits(s, decimals);
}

/// Real on-chain write actions. Each drives the shared tx overlay
/// (wallet → pending → success | error), waits for the receipt, then
/// calls `onSettled` (refetch reads). Returns true on success.
export function useVaultActions(setTx: SetTx, onSettled?: () => void) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  // live factory bounds (falls back to client constants if unreadable)
  const { minLockDays, maxLockDays } = useFactoryLimits();

  const notReady = useCallback((): false => {
    setTx({
      stage: "error",
      title: "Wallet not ready",
      error: "Connect your wallet on Base Sepolia and try again.",
      errorKind: "generic",
    });
    return false;
  }, [setTx]);

  const runFlow = useCallback(
    async (flow: Flow): Promise<boolean> => {
      if (!publicClient) return notReady();
      let lastHash: Hash | undefined;
      try {
        for (const step of flow.steps) {
          setTx({ stage: "wallet", title: step.title, sub: step.sub });
          lastHash = await step.send();
          setTx({ stage: "pending", title: "Transaction on-chain…", sub: "Confirming a block on Base", hash: lastHash });
          const receipt = await publicClient.waitForTransactionReceipt({ hash: lastHash });
          if (receipt.status === "reverted") throw new Error("Transaction reverted on-chain.");
        }
        setTx({
          stage: "success",
          title: flow.success.title,
          sub: flow.success.sub,
          share: flow.success.share,
          hash: lastHash,
        });
        onSettled?.();
        return true;
      } catch (err) {
        const p = parseTxError(err);
        setTx({ stage: "error", title: p.title, error: p.message, errorKind: p.kind, _retry: () => void runFlow(flow) });
        return false;
      }
    },
    [publicClient, setTx, onSettled, notReady],
  );

  /// Build an approve step if the current allowance can't cover `need`.
  const maybeApprove = useCallback(
    async (token: Address, spender: Address, need: bigint, sym: string): Promise<Step | null> => {
      const allowance = (await publicClient!.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, spender],
      })) as bigint;
      if (allowance >= need) return null;
      return {
        title: `Approve access to ${sym}`,
        sub: "Confirm the approve in your wallet",
        send: () => writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, need], dataSuffix: DATA_SUFFIX }),
      };
    },
    [publicClient, address, writeContractAsync],
  );

  const createVault = useCallback(
    async (form: CreateForm): Promise<boolean> => {
      if (!address || !publicClient) return notReady();
      try {
        const asset = form.token.address;
        const amount = toUnits(form.amount, form.token.decimals);
        // Base the unlock on the chain clock (not the device) and clear the
        // factory's live MIN/MAX bounds with a buffer — a min-term lock was
        // reverting with UnlockTooSoon when the device clock lagged the chain.
        let baseSec: number;
        try {
          baseSec = Number((await publicClient.getBlock()).timestamp);
        } catch {
          baseSec = Math.floor(Date.now() / 1000);
        }
        let unlockSec = baseSec + form.days * DAY_SECONDS;
        const minUnlock = baseSec + minLockDays * DAY_SECONDS + UNLOCK_BUFFER_SEC;
        if (unlockSec < minUnlock) unlockSec = minUnlock;
        const maxUnlock = baseSec + maxLockDays * DAY_SECONDS;
        if (unlockSec > maxUnlock) unlockSec = maxUnlock;
        const unlock = BigInt(unlockSec);
        const soft = form.mode === "soft";
        const maxPenaltyBps = soft ? Math.round((form.penalty ?? 0) * 100) : 0;

        const steps: Step[] = [];
        const approve = await maybeApprove(asset, FACTORY_ADDRESS, amount, form.token.sym);
        if (approve) steps.push(approve);
        steps.push({
          title: "Confirm the lock",
          sub: "Open your wallet and sign",
          send: () =>
            writeContractAsync({
              address: FACTORY_ADDRESS,
              abi: factoryAbi,
              functionName: "createVault",
              args: [asset, amount, unlock, soft, maxPenaltyBps],
              dataSuffix: DATA_SUFFIX,
            }),
        });

        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const shareText =
          `🔒 Just locked ${fmtNum(form.amount)} $${form.token.sym} for ${form.days} days on Diamond Hands.\n` +
          `💎 Beat paper hands. ${form.mode === "hard" ? "Hard lock — no exit." : "Soft lock — exit costs."}`;
        return runFlow({
          steps,
          success: {
            title: "Vault created 💎",
            sub: `${fmtNum(form.amount)} ${form.token.sym} locked for ${form.days} days`,
            share: { text: shareText, embeds: origin ? [origin] : undefined },
          },
        });
      } catch (err) {
        const p = parseTxError(err);
        setTx({ stage: "error", title: p.title, error: p.message, errorKind: p.kind, _retry: () => void createVault(form) });
        return false;
      }
    },
    [address, publicClient, maybeApprove, writeContractAsync, runFlow, setTx, notReady, minLockDays, maxLockDays],
  );

  const withdraw = useCallback(
    (v: Vault) =>
      runFlow({
        steps: [
          {
            title: "Confirm withdrawal",
            sub: "Sign the withdrawal in your wallet",
            send: () => writeContractAsync({ address: v.address, abi: vaultAbi, functionName: "withdraw", dataSuffix: DATA_SUFFIX }),
          },
        ],
        success: { title: "Withdrawn ✓", sub: `${fmtNum(v.amount)} ${v.token.sym} in your wallet` },
      }),
    [runFlow, writeContractAsync],
  );

  const emergencyWithdraw = useCallback(
    (v: Vault) => {
      const pen = currentPenaltyPct(v, Date.now());
      const receive = v.amount * (1 - pen / 100);
      return runFlow({
        steps: [
          {
            title: "Confirm early exit",
            sub: "Sign the penalized transaction",
            send: () => writeContractAsync({ address: v.address, abi: vaultAbi, functionName: "emergencyWithdraw", dataSuffix: DATA_SUFFIX }),
          },
        ],
        success: { title: "Exit done", sub: `Received ~${fmtNum(receive)} ${v.token.sym} (penalty ${pen.toFixed(1)}%)` },
      });
    },
    [runFlow, writeContractAsync],
  );

  const topUp = useCallback(
    async (v: Vault, num: number): Promise<boolean> => {
      if (!address || !publicClient) return notReady();
      try {
        const add = toUnits(num, v.token.decimals);
        const steps: Step[] = [];
        const approve = await maybeApprove(v.token.address, v.address, add, v.token.sym);
        if (approve) steps.push(approve);
        steps.push({
          title: "Confirm top-up",
          sub: "Sign in your wallet",
          send: () => writeContractAsync({ address: v.address, abi: vaultAbi, functionName: "topUp", args: [add], dataSuffix: DATA_SUFFIX }),
        });
        return runFlow({ steps, success: { title: "Topped up ✓", sub: `+${fmtNum(num)} ${v.token.sym} in the vault` } });
      } catch (err) {
        const p = parseTxError(err);
        setTx({ stage: "error", title: p.title, error: p.message, errorKind: p.kind, _retry: () => void topUp(v, num) });
        return false;
      }
    },
    [address, publicClient, maybeApprove, writeContractAsync, runFlow, setTx, notReady],
  );

  const extendLock = useCallback(
    (v: Vault, days: number) => {
      const newUnlock = BigInt(Math.floor(v.unlock / 1000) + days * DAY_SECONDS);
      return runFlow({
        steps: [
          {
            title: "Confirm extension",
            sub: "Sign in your wallet",
            send: () => writeContractAsync({ address: v.address, abi: vaultAbi, functionName: "extendLock", args: [newUnlock], dataSuffix: DATA_SUFFIX }),
          },
        ],
        success: { title: "Term extended ✓", sub: `+${days} days added` },
      });
    },
    [runFlow, writeContractAsync],
  );

  const checkIn = useCallback(
    (v: Vault) =>
      runFlow({
        steps: [
          {
            title: "Daily check-in",
            sub: "Sign the check-in in your wallet",
            send: () => writeContractAsync({ address: v.address, abi: vaultAbi, functionName: "checkIn", dataSuffix: DATA_SUFFIX }),
          },
        ],
        success: { title: "Checked in ✓", sub: "Your streak is recorded on-chain" },
      }),
    [runFlow, writeContractAsync],
  );

  return { createVault, withdraw, emergencyWithdraw, topUp, extendLock, checkIn };
}
