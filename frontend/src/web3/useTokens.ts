import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits, isAddress, type Address } from "viem";
import type { Token } from "../types";
import { CHAIN_ID, erc20Abi } from "./contracts";
import { KNOWN_TOKENS, resolveToken } from "./tokenRegistry";
import { useTokenPrice, useTokenPrices } from "./usePrices";

const KNOWN_ADDRESSES = KNOWN_TOKENS.map((t) => t.address);

/// Known tokens with the connected wallet's live balance + USD price attached.
/// Used by the create flow's picker. Price comes from DefiLlama (mainnet);
/// tokens it doesn't cover keep `price` undefined → USD shows "—".
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
  const { prices } = useTokenPrices(KNOWN_ADDRESSES);

  return useMemo(
    () =>
      KNOWN_TOKENS.map((t, i) => {
        const r = reads.data?.[i];
        const balance =
          r?.status === "success" ? Number(formatUnits(r.result as bigint, t.decimals)) : undefined;
        return { ...t, balance, price: prices.get(t.address.toLowerCase()) };
      }),
    [reads.data, prices],
  );
}

/// Resolve an arbitrary ERC-20 by contract address (custom token in the create
/// picker). Reads symbol/decimals + the wallet's balance. `token` is undefined
/// while loading or when the address isn't a readable ERC-20 (then `isInvalid`).
export function useCustomToken(address?: Address): {
  token?: Token;
  isLoading: boolean;
  isInvalid: boolean;
} {
  const { address: owner } = useAccount();
  const valid = !!address && isAddress(address);

  const contracts = useMemo(() => {
    if (!valid || !address) return [];
    const base = [
      { abi: erc20Abi, address, functionName: "symbol" as const, chainId: CHAIN_ID },
      { abi: erc20Abi, address, functionName: "decimals" as const, chainId: CHAIN_ID },
    ];
    return owner
      ? [
          ...base,
          { abi: erc20Abi, address, functionName: "balanceOf" as const, args: [owner] as const, chainId: CHAIN_ID },
        ]
      : base;
  }, [valid, address, owner]);

  const reads = useReadContracts({ contracts, query: { enabled: valid } });
  const { price } = useTokenPrice(valid ? address : undefined);

  const token = useMemo<Token | undefined>(() => {
    if (!valid || !address || !reads.data) return undefined;
    const dec = reads.data[1];
    if (!dec || dec.status !== "success") return undefined; // not an ERC-20 here
    const sym = reads.data[0];
    const t = resolveToken(address, {
      symbol: sym?.status === "success" ? (sym.result as string) : undefined,
      decimals: Number(dec.result),
    });
    const bal = reads.data[2];
    const balance =
      bal?.status === "success" ? Number(formatUnits(bal.result as bigint, t.decimals)) : undefined;
    return { ...t, balance, price };
  }, [valid, address, reads.data, price]);

  return {
    token,
    isLoading: valid && reads.isLoading,
    isInvalid: valid && !reads.isLoading && !token,
  };
}
