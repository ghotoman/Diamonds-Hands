import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { getAbiItem } from "viem";
import type { Vault } from "../types";
import { CHAIN_ID, vaultAbi } from "./contracts";

const DAY_MS = 86_400_000;
const CHECKED_IN_EVENT = getAbiItem({ abi: vaultAbi, name: "CheckedIn" });
/// Per-chunk block range — safe for public Base RPCs (which usually cap
/// eth_getLogs at ~10k blocks). Tunable per env.
const CHUNK = 9_000n;
/// Max parallel getLogs in flight.
const CONCURRENCY = 5;
/// Cap the scan to the most recent N days. A 30-day cap covers any plausible
/// streak; older check-ins age out and don't count anyway.
const MAX_SCAN_DAYS = 30;

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
      // Range: min(lock-period-elapsed, MAX_SCAN_DAYS) + 1d buffer. Scanned in
      // chunks so strict public RPCs (Base sepolia caps ~10k blocks/call) work.
      const latest = await publicClient.getBlock({ blockTag: "latest" });
      const elapsedSec = Math.max(0, Number(latest.timestamp) - Math.floor(vault.start / 1000));
      const cappedSec = Math.min(elapsedSec, MAX_SCAN_DAYS * 86_400);
      const approxBlocks = BigInt(Math.ceil(cappedSec / 2) + 43_200);
      const fromBlock = latest.number > approxBlocks ? latest.number - approxBlocks : 0n;
      const toBlock = latest.number;
      // Build CHUNK-sized ranges; run them with bounded parallelism. A failed
      // chunk (RPC range cap, rate limit) is skipped so partial data still
      // gives a useful streak instead of throwing the whole query.
      const ranges: Array<[bigint, bigint]> = [];
      for (let f = fromBlock; f <= toBlock; f = f + CHUNK + 1n) {
        const t = f + CHUNK > toBlock ? toBlock : f + CHUNK;
        ranges.push([f, t]);
      }
      const ts: number[] = [];
      for (let i = 0; i < ranges.length; i += CONCURRENCY) {
        const batch = ranges.slice(i, i + CONCURRENCY);
        const got = await Promise.all(
          batch.map(async ([f, t]) => {
            try {
              return await publicClient.getLogs({
                address: vault.address,
                event: CHECKED_IN_EVENT,
                fromBlock: f,
                toBlock: t,
              });
            } catch {
              return [];
            }
          }),
        );
        for (const logs of got) {
          for (const log of logs) {
            const stamp = log.args?.timestamp;
            if (typeof stamp === "bigint") ts.push(Number(stamp) * 1000);
          }
        }
      }
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
