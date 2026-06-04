import { useCallback, useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import type { Vault } from "../types";
import { CHAIN_ID, FACTORY_ADDRESS, erc20Abi, factoryAbi, vaultAbi } from "./contracts";
import { mapVault, type AssetMeta, type VaultReads } from "./mapVault";

/// Vault view fields read per clone, in this fixed order (consumed by mapVault).
const VAULT_FIELDS = [
  "asset",
  "amount",
  "lockStartedAt",
  "unlockTimestamp",
  "allowEarlyExit",
  "withdrawn",
  "maxPenaltyBps",
  "currentPenaltyBps",
] as const;
const FIELD_COUNT = VAULT_FIELDS.length;

type ReadResult = { status: "success" | "failure"; result?: unknown; error?: unknown };

/// Read N vault clones → UI Vault[]. Shared by useVaults / useVault.
/// Two multicalls: (1) every vault's view fields, (2) symbol+decimals of every
/// distinct asset. Resilient — a vault whose reads fail is skipped, not fatal.
function useVaultReads(addresses: Address[]) {
  // (1) view fields of every vault
  const vaultContracts = useMemo(
    () =>
      addresses.flatMap((address) =>
        VAULT_FIELDS.map((functionName) => ({
          abi: vaultAbi,
          address,
          functionName,
          chainId: CHAIN_ID,
        })),
      ),
    [addresses],
  );

  const viewReads = useReadContracts({
    contracts: vaultContracts,
    query: { enabled: addresses.length > 0 },
  });

  const rawVaults = useMemo<VaultReads[]>(() => {
    const data = viewReads.data as ReadResult[] | undefined;
    if (!data) return [];
    const out: VaultReads[] = [];
    for (let i = 0; i < addresses.length; i++) {
      const slice = data.slice(i * FIELD_COUNT, i * FIELD_COUNT + FIELD_COUNT);
      if (slice.length < FIELD_COUNT || slice.some((r) => r.status !== "success")) continue;
      const [asset, amount, lockStartedAt, unlockTimestamp, allowEarlyExit, withdrawn, maxPenaltyBps, currentPenaltyBps] =
        slice.map((r) => r.result);
      out.push({
        address: addresses[i],
        asset: asset as Address,
        amount: amount as bigint,
        lockStartedAt: lockStartedAt as bigint,
        unlockTimestamp: unlockTimestamp as bigint,
        allowEarlyExit: allowEarlyExit as boolean,
        withdrawn: withdrawn as boolean,
        maxPenaltyBps: Number(maxPenaltyBps),
        currentPenaltyBps: currentPenaltyBps as bigint,
      });
    }
    return out;
  }, [viewReads.data, addresses]);

  // (2) distinct asset metadata
  const assetAddrs = useMemo(() => {
    const seen = new Map<string, Address>();
    for (const v of rawVaults) seen.set(v.asset.toLowerCase(), v.asset);
    return [...seen.values()];
  }, [rawVaults]);

  const assetContracts = useMemo(
    () =>
      assetAddrs.flatMap((address) => [
        { abi: erc20Abi, address, functionName: "symbol", chainId: CHAIN_ID },
        { abi: erc20Abi, address, functionName: "decimals", chainId: CHAIN_ID },
      ]),
    [assetAddrs],
  );

  const metaReads = useReadContracts({
    contracts: assetContracts,
    query: { enabled: assetAddrs.length > 0 },
  });

  const assetMeta = useMemo(() => {
    const map = new Map<string, AssetMeta>();
    const data = metaReads.data as ReadResult[] | undefined;
    if (data) {
      assetAddrs.forEach((addr, i) => {
        const sym = data[i * 2];
        const dec = data[i * 2 + 1];
        map.set(addr.toLowerCase(), {
          symbol: sym?.status === "success" ? (sym.result as string) : undefined,
          decimals: dec?.status === "success" ? Number(dec.result) : undefined,
        });
      });
    }
    return map;
  }, [metaReads.data, assetAddrs]);

  const vaults = useMemo<Vault[]>(
    () => rawVaults.map((r) => mapVault(r, assetMeta.get(r.asset.toLowerCase()))),
    [rawVaults, assetMeta],
  );

  const isLoading =
    (addresses.length > 0 && viewReads.isLoading) || (assetAddrs.length > 0 && metaReads.isLoading);
  const isError = viewReads.isError || metaReads.isError;
  const error = viewReads.error ?? metaReads.error ?? null;

  const refetch = useCallback(() => {
    viewReads.refetch();
    metaReads.refetch();
  }, [viewReads.refetch, metaReads.refetch]);

  return { vaults, isLoading, isError, error, refetch };
}

/// All vaults owned by `owner` (undefined disables the read).
/// Reads Factory.getVaultsByOwner → multicall each Vault → map to UI Vault[].
/// Returns coarse states for the UI: isLoading / isError / isEmpty.
export function useVaults(owner?: Address) {
  const factory = useReadContract({
    abi: factoryAbi,
    address: FACTORY_ADDRESS,
    functionName: "getVaultsByOwner",
    args: owner ? [owner] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!owner },
  });

  const addresses = useMemo(() => (factory.data as Address[] | undefined) ?? [], [factory.data]);

  const reads = useVaultReads(addresses);

  const isLoading = (!!owner && factory.isLoading) || reads.isLoading;
  const isError = factory.isError || reads.isError;
  const error = factory.error ?? reads.error;
  const isEmpty = !!owner && !factory.isLoading && !factory.isError && addresses.length === 0;

  const refetch = useCallback(() => {
    factory.refetch();
    reads.refetch();
  }, [factory.refetch, reads.refetch]);

  return { vaults: reads.vaults, addresses, isLoading, isError, error, isEmpty, refetch };
}

/// A single vault by address (undefined disables the read).
export function useVault(address?: Address) {
  const addresses = useMemo(() => (address ? [address] : []), [address]);
  const reads = useVaultReads(addresses);
  return {
    vault: reads.vaults[0] as Vault | undefined,
    isLoading: reads.isLoading,
    isError: reads.isError,
    error: reads.error,
    refetch: reads.refetch,
  };
}

/// Convenience: the connected account's vaults.
export function useMyVaults() {
  const { address } = useAccount();
  return useVaults(address);
}
