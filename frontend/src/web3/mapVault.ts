import { formatUnits, type Address } from "viem";
import type { Token, Vault, VaultMode, VaultStatus } from "../types";
import { resolveToken } from "./tokenRegistry";

/// Raw on-chain Vault view reads — straight off the clone (bigint / bool).
/// Field order mirrors useVaults' VAULT_FIELDS multicall.
export type VaultReads = {
  address: Address;
  asset: Address;
  amount: bigint;
  lockStartedAt: bigint;
  unlockTimestamp: bigint;
  allowEarlyExit: boolean;
  withdrawn: boolean;
  maxPenaltyBps: number; // uint16
  currentPenaltyBps: bigint;
};

/// ERC-20 metadata of the asset (read alongside; may be partial).
export type AssetMeta = { symbol?: string; decimals?: number };

/// Map raw on-chain reads → the UI Vault shape. Pure:
/// - amount: formatUnits with the token's decimals (human number)
/// - timestamps: on-chain seconds × 1000 (ms epoch)
/// - mode: allowEarlyExit ? "soft" : "hard"
/// - penalty: bps ÷ 100 (percent); startPenalty only in soft mode
/// - status: withdrawn → "withdrawn", else past unlock → "unlocked", else "active"
export function mapVault(reads: VaultReads, meta?: AssetMeta, now: number = Date.now()): Vault {
  const token: Token = resolveToken(reads.asset, meta);
  const amount = Number(formatUnits(reads.amount, token.decimals));
  const start = Number(reads.lockStartedAt) * 1000;
  const unlock = Number(reads.unlockTimestamp) * 1000;
  const mode: VaultMode = reads.allowEarlyExit ? "soft" : "hard";

  const status: VaultStatus = reads.withdrawn ? "withdrawn" : now >= unlock ? "unlocked" : "active";

  return {
    address: reads.address,
    token,
    amount,
    mode,
    startPenalty: mode === "soft" ? reads.maxPenaltyBps / 100 : undefined,
    start,
    unlock,
    status,
    currentPenalty: Number(reads.currentPenaltyBps) / 100,
    // checkIns / lastCheckIn need an event indexer — left undefined on-chain.
  };
}
