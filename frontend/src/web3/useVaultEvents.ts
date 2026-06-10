import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import type { Vault } from "../types";
import { CHAIN_ID } from "./contracts";

const DAY_MS = 86_400_000;
/// Explicit event signature — robust across viem ABI item typings.
const CHECKED_IN_EVENT = parseAbiItem("event CheckedIn(address indexed owner, uint256 timestamp)");
/// eth_getLogs block-range caps differ wildly per provider (public Base RPC,
/// Alchemy free tier ~2k, QuickNode 10k…). A cheap descending probe on the
/// newest slice finds what this provider accepts; the rest of the window is
/// then scanned at that size, newest-first.
const PROBE_SIZES = [9_000n, 1_900n, 450n] as const;
/// Max parallel getLogs in flight.
const CONCURRENCY = 5;
/// Hard budget of scan calls per refresh — keeps tiny-cap providers from
/// burning hundreds of requests. Newest blocks win when truncated.
const MAX_CALLS = 60;
/// Cap the scan window. 7 days covers any plausible "streak ending today".
const MAX_SCAN_DAYS = 7;

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

      const ts: number[] = [];
      const collect = (logs: Awaited<ReturnType<typeof publicClient.getLogs>>) => {
        for (const log of logs) {
          const stamp = (log as { args?: { timestamp?: unknown } }).args?.timestamp;
          if (typeof stamp === "bigint") ts.push(Number(stamp) * 1000);
        }
      };
      const fetchRange = (f: bigint, t: bigint) =>
        publicClient.getLogs({
          address: vault.address,
          event: CHECKED_IN_EVENT,
          fromBlock: f,
          toBlock: t,
        });

      // 1) Probe, newest slice first: whole window, then descending sizes.
      //    The successful probe's logs are already the most recent data.
      let firstError: unknown = null;
      let chunk: bigint | null = null;
      let scannedDownTo: bigint | null = null;
      const windowSize = toBlock - fromBlock;
      const sizes = [windowSize, ...PROBE_SIZES.filter((s) => s < windowSize)];
      for (const size of sizes) {
        const f = toBlock - size < fromBlock ? fromBlock : toBlock - size;
        try {
          collect(await fetchRange(f, toBlock));
          chunk = size;
          scannedDownTo = f;
          break;
        } catch (err) {
          if (!firstError) firstError = err;
        }
      }
      if (chunk === null || scannedDownTo === null) {
        // eslint-disable-next-line no-console
        console.warn(
          `[useVaultEvents] eth_getLogs unusable on this RPC even at ${PROBE_SIZES[PROBE_SIZES.length - 1]} blocks — streak shows 0.`,
          "Set VITE_BASE_SEPOLIA_RPC_URL to a provider like Alchemy. First error:",
          firstError,
        );
        return ts;
      }

      // 2) Scan the remaining window newest→oldest at the probed size, within
      //    a hard call budget (recent days matter most for the streak).
      const ranges: Array<[bigint, bigint]> = [];
      for (let t = scannedDownTo - 1n; t >= fromBlock; t -= chunk + 1n) {
        const f = t - chunk < fromBlock ? fromBlock : t - chunk;
        ranges.push([f, t]);
        if (ranges.length >= MAX_CALLS) break;
      }
      let failures = 0;
      for (let i = 0; i < ranges.length; i += CONCURRENCY) {
        const batch = ranges.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async ([f, t]) => {
            try {
              collect(await fetchRange(f, t));
            } catch (err) {
              failures++;
              if (!firstError) firstError = err;
            }
          }),
        );
      }
      if (failures > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[useVaultEvents] ${failures}/${ranges.length} ranges failed for ${vault.address}; streak may undercount older days.`,
          "First error:",
          firstError,
        );
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
