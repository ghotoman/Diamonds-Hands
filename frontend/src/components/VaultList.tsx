import { useImperativeHandle, forwardRef } from "react";
import type { Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { factoryAbi } from "../abis/factory";
import { FACTORY_ADDRESS } from "../lib/addresses";
import { VaultCard } from "./VaultCard";

export type VaultListHandle = { refetch: () => void };

/// List of the current user's vaults (via Factory.getVaultsByOwner).
export const VaultList = forwardRef<VaultListHandle>((_props, ref) => {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getVaultsByOwner",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  useImperativeHandle(ref, () => ({ refetch: () => void refetch() }), [refetch]);

  const vaults = (data as readonly Address[] | undefined) ?? [];

  if (!address) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-slate-100">
        My vaults {vaults.length > 0 && `(${vaults.length})`}
      </h2>

      {isLoading && <p className="text-slate-400">Loading…</p>}

      {!isLoading && vaults.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-400">
          No vaults yet. Create your first one on the left 💎
        </p>
      )}

      <div className="grid gap-4">
        {vaults.map((v) => (
          <VaultCard
            key={v}
            vault={v}
            owner={address}
            onChanged={() => void refetch()}
          />
        ))}
      </div>
    </div>
  );
});

VaultList.displayName = "VaultList";
