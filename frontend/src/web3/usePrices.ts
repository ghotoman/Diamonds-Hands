import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { CHAIN_ID } from "./contracts";
import { base } from "wagmi/chains";

/// DefiLlama coins API base. Free, no key, covers most Base mainnet tokens.
/// Same source the off-chain TVL monitor uses, so price for a given asset is
/// consistent across the dashboard / create flow / monitor.
const PRICE_API = "https://coins.llama.fi";

/// DefiLlama keys tokens by `<chain>:<address>`. We only price on mainnet —
/// no Base Sepolia coverage exists there, so the hook short-circuits on
/// testnet to avoid surfacing a misleading "no price" state.
const CHAIN_PREFIX = CHAIN_ID === base.id ? "base" : null;

/// Fetch USD price for an ERC-20 by address. Returns `undefined` while
/// loading and when the token simply isn't priced (DefiLlama doesn't cover
/// every long-tail token). Cached for 60s and revalidated in the background;
/// shares the global TanStack cache, so multiple components reading the same
/// token only fire one network request.
export function useTokenPrice(address?: Address): { price?: number; isLoading: boolean } {
  const lc = address?.toLowerCase();
  const enabled = !!lc && !!CHAIN_PREFIX;
  const q = useQuery({
    queryKey: ["token-price", CHAIN_PREFIX, lc],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const id = `${CHAIN_PREFIX}:${lc}`;
      const res = await fetch(`${PRICE_API}/prices/current/${id}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { coins?: Record<string, { price?: number }> };
      const p = data?.coins?.[id]?.price;
      return typeof p === "number" ? p : null;
    },
  });
  return { price: q.data ?? undefined, isLoading: enabled && q.isLoading };
}
