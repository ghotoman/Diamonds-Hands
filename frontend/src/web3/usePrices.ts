import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { base } from "wagmi/chains";

import { CHAIN_ID } from "./contracts";

/// DefiLlama coins API base. Free, no key, covers most Base mainnet tokens.
/// Same source the off-chain TVL monitor uses, so a price shown in the UI is
/// consistent with the monitor's accounting.
const PRICE_API = "https://coins.llama.fi";

/// DefiLlama keys tokens by `<chain>:<address>`. We only price on mainnet —
/// no Base Sepolia coverage exists there, so the hooks short-circuit on
/// testnet rather than surface a misleading "no price" everywhere.
const CHAIN_PREFIX = CHAIN_ID === base.id ? "base" : null;

export type PriceMap = Map<string, number>; // lowercased address → USD price

/// Batched USD prices for many ERC-20s in ONE DefiLlama request. Returns a
/// Map keyed by lowercased address (missing tokens are simply absent — not
/// every long-tail token is priced). Cached 60s + revalidated; the query key
/// is the sorted address set, so identical sets across components dedupe and
/// a changed vault list refetches.
export function useTokenPrices(addresses: ReadonlyArray<Address | undefined>): {
  prices: PriceMap;
  isLoading: boolean;
} {
  // Normalise → unique, lowercased, sorted (stable key regardless of input order).
  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const a of addresses) if (a) set.add(a.toLowerCase());
    return [...set].sort();
  }, [addresses]);

  const enabled = !!CHAIN_PREFIX && ids.length > 0;

  const q = useQuery({
    queryKey: ["token-prices", CHAIN_PREFIX, ids],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PriceMap> => {
      const param = ids.map((a) => `${CHAIN_PREFIX}:${a}`).join(",");
      const res = await fetch(`${PRICE_API}/prices/current/${param}`);
      const map: PriceMap = new Map();
      if (!res.ok) return map;
      const data = (await res.json()) as { coins?: Record<string, { price?: number }> };
      for (const [coinId, v] of Object.entries(data.coins ?? {})) {
        const addr = coinId.split(":")[1]?.toLowerCase();
        if (addr && typeof v.price === "number") map.set(addr, v.price);
      }
      return map;
    },
  });

  return { prices: q.data ?? EMPTY, isLoading: enabled && q.isLoading };
}

const EMPTY: PriceMap = new Map();

/// USD price for a single ERC-20 (convenience over useTokenPrices). Shares the
/// same cache, so a single-token lookup and a batch that includes it dedupe
/// only when their address sets match — fine for the create flow, where the
/// amount step prices just the selected token.
export function useTokenPrice(address?: Address): { price?: number; isLoading: boolean } {
  const addrs = useMemo(() => (address ? [address] : []), [address]);
  const { prices, isLoading } = useTokenPrices(addrs);
  return { price: address ? prices.get(address.toLowerCase()) : undefined, isLoading };
}
