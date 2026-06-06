import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { getAbiItem } from "viem";
import type { Vault } from "../types";
import { CHAIN_ID, vaultAbi } from "./contracts";

const DAY_MS = 86_400_000;
const CHECKED_IN_EVENT = getAbiItem({ abi: vaultAbi, name: "CheckedIn" });

export type VaultEvents = {
  /// Streak: consecutive UTC days with a check-in, ending today or yesterday.
  checkIns: number;
  /// Total check-in events recorded for this vault.
  totalCheckIns: number;
  /// Most recent check-in (ms epoch), undefined if none.
  lastCheckIn?: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/// Client-side indexer for a vault's CheckedIn events — RPC getLogs bounded
/// by the lock's lifetime. No external service. Derives the streak count and
/// "checked today" state the dashboard already wants to render.
export function useVaultEvents(vault?: Vault): VaultEvents {
  const publicClient = usePublicClient();

  const q = useQuery({
    queryKey: ["vault-events", CHAIN_ID, vault?.address?.toLowerCase()],
    enabled: !!vault && !!publicClient,
    staleTime: 30_000,
    queryFn: async (): Promise<number[]> => {
      if (!vault || !publicClient) return [];
      // Cheap range: this lock period + 1 day buffer. Bounds getLogs for the
      // strict public RPCs (Base sepolia ~2s blocks).
      let fromBlock = 0n;
      try {
        const latest = await publicClient.getBlock({ blockTag: "latest" });
        const elapsedSec = Math.max(0, Number(latest.timestamp) - Math.floor(vault.start / 1000));
        const approxBlocks = BigInt(Math.ceil(elapsedSec / 2) + 43_200);
        fromBlock = latest.number > approxBlocks ? latest.number - approxBlocks : 0n;
      } catch {
        // fall back to 'earliest'
      }
      const logs = await publicClient.getLogs({
        address: vault.address,
        event: CHECKED_IN_EVENT,
        fromBlock,
        toBlock: "latest",
      });
      const ts = logs
        .map((l) => Number((l.args as { timestamp: bigint }).timestamp) * 1000)
        .filter((t) => Number.isFinite(t));
      ts.sort((a, b) => a - b);
      return ts;
    },
  });

  return useMemo<VaultEvents>(() => {
    const ts = q.data ?? [];
    const total = ts.length;
    const last = total > 0 ? ts[total - 1] : undefined;
    const today = Math.floor(Date.now() / DAY_MS);
    const dayKey = (t: number) => Math.floor(t / DAY_MS);
    const days = new Set(ts.map(dayKey));
    let cursor: number | null = days.has(today) ? today : days.has(today - 1) ? today - 1 : null;
    let streak = 0;
    while (cursor !== null && days.has(cursor)) {
      streak++;
      cursor--;
    }
    return {
      checkIns: streak,
      totalCheckIns: total,
      lastCheckIn: last,
      isLoading: q.isLoading,
      isError: q.isError,
      refetch: () => void q.refetch(),
    };
  }, [q.data, q.isLoading, q.isError, q.refetch]);
}
