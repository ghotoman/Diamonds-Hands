import { useReadContract } from "wagmi";
import type { Address } from "viem";

import { CHAIN_ID, REGISTRY_ADDRESS, registryAbi } from "./contracts";

export type Profile = { name: string; link: string; updatedAt: bigint };

/// Read a user's on-chain profile from DiamondHandsRegistry. Returns
/// `undefined` while loading, on chains without the registry, or for an
/// address that never set one (empty strings are normalised to undefined).
export function useProfile(user?: Address): {
  profile?: Profile;
  isLoading: boolean;
  refetch: () => void;
} {
  const q = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "getProfile",
    args: user ? [user] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!REGISTRY_ADDRESS && !!user },
  });

  const p = q.data as { name: string; link: string; updatedAt: bigint } | undefined;
  const hasAny = !!p && (p.name.length > 0 || p.link.length > 0);

  return {
    profile: hasAny ? { name: p!.name, link: p!.link, updatedAt: p!.updatedAt } : undefined,
    isLoading: q.isLoading,
    refetch: () => void q.refetch(),
  };
}
