import { formatUnits } from "viem";

/// A vault and the ERC-20 it holds (from the factory's VaultCreated event).
export type VaultRef = { vault: string; asset: string };

/// On-chain + price metadata for one asset.
export type AssetMeta = {
  /// ERC-20 decimals (read on-chain; authoritative).
  decimals: number;
  /// ERC-20 symbol (read on-chain; cosmetic).
  symbol: string;
  /// USD price, or null when no price source knows this token. A null price
  /// contributes 0 USD to TVL and is surfaced separately so an operator can
  /// review it (the cap is a risk bound, not an accounting figure).
  priceUsd: number | null;
};

/// Per-asset TVL breakdown row.
export type AssetTvl = {
  asset: string;
  symbol: string;
  decimals: number;
  /// Raw token units summed across this asset's vaults.
  lockedRaw: bigint;
  /// Human-readable token amount (lockedRaw / 10^decimals).
  locked: number;
  priceUsd: number | null;
  /// USD value (0 when priceUsd is null).
  valueUsd: number;
};

export type TvlReport = {
  /// Total USD across all assets with a known price.
  tvlUsd: number;
  /// Per-asset rows, sorted by USD value desc.
  assets: AssetTvl[];
  /// Assets holding a non-zero balance but with no known price. Their value
  /// is NOT counted in tvlUsd — review these manually (a no-price token can
  /// still represent real exposure to a contract bug).
  unknownPriceAssets: AssetTvl[];
};

/// Sum locked balances per asset across all vaults. Vaults that have been
/// fully withdrawn report a zero balance and drop out automatically, so this
/// reflects CURRENT value held by vault contracts (not cumulative inflow).
/// Keys are lowercased addresses. Pure.
export function aggregateByAsset(vaults: VaultRef[], balanceByVault: Map<string, bigint>): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const { vault, asset } of vaults) {
    const bal = balanceByVault.get(vault.toLowerCase()) ?? 0n;
    if (bal === 0n) continue;
    const key = asset.toLowerCase();
    out.set(key, (out.get(key) ?? 0n) + bal);
  }
  return out;
}

/// Build a TVL report from per-asset locked totals + metadata. Pure.
export function computeTvl(lockedByAsset: Map<string, bigint>, metaByAsset: Map<string, AssetMeta>): TvlReport {
  const assets: AssetTvl[] = [];
  for (const [asset, lockedRaw] of lockedByAsset) {
    const meta: AssetMeta = metaByAsset.get(asset) ?? { decimals: 18, symbol: "?", priceUsd: null };
    const locked = Number(formatUnits(lockedRaw, meta.decimals));
    const valueUsd = meta.priceUsd === null ? 0 : locked * meta.priceUsd;
    assets.push({
      asset,
      symbol: meta.symbol,
      decimals: meta.decimals,
      lockedRaw,
      locked,
      priceUsd: meta.priceUsd,
      valueUsd,
    });
  }
  assets.sort((a, b) => b.valueUsd - a.valueUsd);
  const tvlUsd = assets.reduce((sum, a) => sum + a.valueUsd, 0);
  const unknownPriceAssets = assets.filter((a) => a.priceUsd === null && a.lockedRaw > 0n);
  return { tvlUsd, assets, unknownPriceAssets };
}

export type AlertLevel = "OK" | "WARN" | "CRITICAL";

export type Thresholds = {
  /// Hard cap (the soft-launch limit, e.g. $1,000,000).
  hardUsd: number;
  /// Early-warning level (e.g. 80% of the cap) — alert with buffer so the
  /// multisig has time to pause BEFORE the cap is actually breached.
  warnUsd: number;
};

/// CRITICAL at/above the cap, WARN at/above the warning level, else OK. Pure.
export function evaluateLevel(tvlUsd: number, t: Thresholds): AlertLevel {
  if (tvlUsd >= t.hardUsd) return "CRITICAL";
  if (tvlUsd >= t.warnUsd) return "WARN";
  return "OK";
}

/// Cap + a warning level at `warnRatio` of the cap (default 80%).
export function makeThresholds(hardUsd = 1_000_000, warnRatio = 0.8): Thresholds {
  return { hardUsd, warnUsd: Math.floor(hardUsd * warnRatio) };
}
