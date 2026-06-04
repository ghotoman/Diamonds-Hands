import { useImperativeHandle, forwardRef } from "react";
import type { Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { factoryAbi } from "../abis/factory";
import { FACTORY_ADDRESS } from "../lib/addresses";
import { VaultCard } from "./VaultCard";

export type VaultListHandle = { refetch: () => void };

/// Список Vault'ов текущего пользователя (через Factory.getVaultsByOwner).
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
        Мои Vault'ы {vaults.length > 0 && `(${vaults.length})`}
      </h2>

      {isLoading && <p className="text-slate-400">Загрузка…</p>}

      {!isLoading && vaults.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-400">
          Пока нет Vault'ов. Создай первый слева 💎
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
