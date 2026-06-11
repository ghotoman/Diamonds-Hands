import { useReadContracts } from "wagmi";
import { CHAIN_ID, FACTORY_ADDRESS, MAX_LOCK_DAYS, MIN_LOCK_DAYS, factoryAbi } from "./contracts";

const DAY_SECONDS = 86_400;

/// Live lock-term limits of the ACTIVE factory (the one createVault targets).
/// Chain truth drives the create-flow validation/copy, so the UI stays correct
/// whichever factory build is deployed. Falls back to client constants while
/// loading or if the read fails.
export function useFactoryLimits(): { minLockDays: number; maxLockDays: number } {
  const reads = useReadContracts({
    contracts: [
      { abi: factoryAbi, address: FACTORY_ADDRESS, functionName: "MIN_LOCK_DURATION", chainId: CHAIN_ID },
      { abi: factoryAbi, address: FACTORY_ADDRESS, functionName: "MAX_LOCK_DURATION", chainId: CHAIN_ID },
    ],
    query: { staleTime: Infinity }, // constants — one read per session
  });

  const [min, max] = reads.data ?? [];
  const minLockDays =
    min?.status === "success" ? Math.max(1, Math.round(Number(min.result) / DAY_SECONDS)) : MIN_LOCK_DAYS;
  const maxLockDays =
    max?.status === "success" ? Math.round(Number(max.result) / DAY_SECONDS) : MAX_LOCK_DAYS;

  return { minLockDays, maxLockDays };
}
