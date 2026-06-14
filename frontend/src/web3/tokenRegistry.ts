import type { Address } from "viem";
import type { Token } from "../types";
import { WETH_ADDRESS } from "./contracts";

/// Known tokens by address (lowercased). Resolves a vault's `asset` to a
/// nice {sym,name,color,decimals}. Unknown tokens fall back to on-chain
/// symbol/decimals + a deterministic color (never breaks on an unknown token).
type KnownMeta = { sym: string; name: string; color: string; decimals: number };

const KNOWN: Record<string, KnownMeta> = {
  [WETH_ADDRESS.toLowerCase()]: {
    sym: "WETH",
    name: "Wrapped Ether",
    color: "#627EEA",
    decimals: 18,
  },
};

// Optional: a test token (e.g. DHT from DeployMockToken) via env.
const testTokenAddr = import.meta.env.VITE_TEST_TOKEN_ADDRESS?.toLowerCase();
if (testTokenAddr) {
  KNOWN[testTokenAddr] = { sym: "DHT", name: "Diamond Test Token", color: "#0000FF", decimals: 18 };
}

/// Known tokens as UI Token[] (no balance/price). Drives the create
/// picker in live mode — real Base Sepolia assets the contracts accept.
export const KNOWN_TOKENS: Token[] = Object.entries(KNOWN).map(([address, m]) => ({
  address: address as Address,
  sym: m.sym,
  name: m.name,
  color: m.color,
  decimals: m.decimals,
}));

/// Deterministic pleasant color from an address.
function colorFromAddress(addr: string): string {
  let h = 0;
  for (let i = 2; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 45%)`;
}

/// Resolve an asset address into a UI Token. `onchain` provides
/// symbol/decimals read from the ERC-20 when not in the known list.
export function resolveToken(
  address: Address,
  onchain?: { symbol?: string; decimals?: number },
): Token {
  const known = KNOWN[address.toLowerCase()];
  if (known) {
    return { address, sym: known.sym, name: known.name, color: known.color, decimals: known.decimals };
  }
  const sym = onchain?.symbol?.trim() || `${address.slice(0, 4)}…${address.slice(-2)}`;
  return {
    address,
    sym,
    name: sym,
    color: colorFromAddress(address),
    decimals: onchain?.decimals ?? 18,
  };
}
