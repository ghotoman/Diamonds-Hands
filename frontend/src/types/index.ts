import type { Address } from "viem";

/// UI form of a token (resolved from an on-chain ERC-20 address).
export type Token = {
  address: Address;
  sym: string;
  name: string;
  color: string;
  decimals: number;
  /// optional human-readable wallet balance (read on demand)
  balance?: number;
  /// optional USD price (no on-chain oracle in V1 — may be undefined)
  price?: number;
};

export type VaultMode = "hard" | "soft";
export type VaultStatus = "active" | "unlocked" | "withdrawn";

/// UI form of a vault. Mapped from the on-chain Vault clone via web3/mapVault.
/// - amount is human-readable (formatUnits of the on-chain bigint)
/// - timestamps are ms epoch (on-chain seconds × 1000)
/// - penalty values are percent (on-chain bps ÷ 100)
export type Vault = {
  /// the Vault clone address (also the UI id)
  address: Address;
  token: Token;
  amount: number;
  mode: VaultMode;
  /// soft mode only: starting penalty percent (maxPenaltyBps ÷ 100)
  startPenalty?: number;
  /// lockStartedAt × 1000 — the penalty curve origin (reset on extendLock)
  start: number;
  /// unlockTimestamp × 1000
  unlock: number;
  status: VaultStatus;
  /// current penalty percent (currentPenaltyBps ÷ 100)
  currentPenalty: number;
  /// check-in streak (UI only — derived from CheckedIn events via an indexer;
  /// optional until an indexer exists)
  checkIns?: number;
  lastCheckIn?: number;
  /// the RPC couldn't serve event logs — streak is unknown, not zero
  streakUnavailable?: boolean;
};
