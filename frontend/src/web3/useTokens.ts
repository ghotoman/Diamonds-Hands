import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { formatUnits, type Address } from "viem";
import type { Token } from "../types";
import { CHAIN_ID, erc20Abi } from "./contracts";
import { KNOWN_TOKENS } from "./tokenRegistry";

/// Known tokens with the connected wallet's live balance attached.
/// Used by the create flow's picker in live mode (no price oracle in V1,
/// so `price` stays undefined → USD shows "—").
export function useTokens(owner?: Address): Token[] {
  const contracts = useMemo(
    () =>
      owner
        ? KNOWN_TOKENS.map((t) => ({
            abi: erc20Abi,
            address: t.address,
            functionName: "balanceOf" as const,
            args: [owner] as const,
            chainId: CHAIN_ID,
          }))
        : [],
    [owner],
  );

  const reads = useReadContracts({ contracts, query: { enabled: !!owner } });

  return useMemo(
    () =>
      KNOWN_TOKENS.map((t, i) => {
        const r = reads.data?.[i];
        const balance =
          r?.status === "success" ? Number(formatUnits(r.result as bigint, t.decimals)) : undefined;
        return { ...t, balance };
      }),
    [reads.data],
  );
}
