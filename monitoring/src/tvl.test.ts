import { test } from "node:test";
import assert from "node:assert/strict";

import { aggregateByAsset, computeTvl, evaluateLevel, makeThresholds, type AssetMeta, type VaultRef } from "./tvl.ts";

const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WEIRD = "0xDEADbeEfDEAdBEefDeAdbeEFdEadBEEfdEAdbEeF";

test("aggregateByAsset sums per asset and skips fully-withdrawn vaults", () => {
  const vaults: VaultRef[] = [
    { vault: "0xVault1", asset: WETH },
    { vault: "0xVault2", asset: WETH },
    { vault: "0xVault3", asset: USDC },
    { vault: "0xVault4", asset: USDC }, // withdrawn → 0 balance, dropped
  ];
  const balances = new Map<string, bigint>([
    ["0xvault1", 2n * 10n ** 18n], // 2 WETH
    ["0xvault2", 1n * 10n ** 18n], // 1 WETH
    ["0xvault3", 500n * 10n ** 6n], // 500 USDC
    ["0xvault4", 0n], // withdrawn
  ]);

  const agg = aggregateByAsset(vaults, balances);
  assert.equal(agg.get(WETH.toLowerCase()), 3n * 10n ** 18n);
  assert.equal(agg.get(USDC.toLowerCase()), 500n * 10n ** 6n);
  assert.equal(agg.size, 2);
});

test("aggregateByAsset treats a vault with no balance entry as zero", () => {
  const vaults: VaultRef[] = [{ vault: "0xGhost", asset: WETH }];
  const agg = aggregateByAsset(vaults, new Map());
  assert.equal(agg.size, 0);
});

test("computeTvl converts decimals correctly and sums USD", () => {
  const locked = new Map<string, bigint>([
    [WETH.toLowerCase(), 3n * 10n ** 18n], // 3 WETH
    [USDC.toLowerCase(), 1500n * 10n ** 6n], // 1500 USDC
  ]);
  const meta = new Map<string, AssetMeta>([
    [WETH.toLowerCase(), { decimals: 18, symbol: "WETH", priceUsd: 3000 }],
    [USDC.toLowerCase(), { decimals: 6, symbol: "USDC", priceUsd: 1 }],
  ]);

  const r = computeTvl(locked, meta);
  // 3 * 3000 + 1500 * 1 = 10500
  assert.equal(r.tvlUsd, 10_500);
  // sorted by value desc → WETH first (9000) then USDC (1500)
  assert.equal(r.assets[0]?.symbol, "WETH");
  assert.equal(r.assets[0]?.valueUsd, 9000);
  assert.equal(r.assets[1]?.valueUsd, 1500);
  assert.equal(r.unknownPriceAssets.length, 0);
});

test("computeTvl excludes unknown-price assets from TVL but surfaces them", () => {
  const locked = new Map<string, bigint>([
    [WETH.toLowerCase(), 1n * 10n ** 18n],
    [WEIRD.toLowerCase(), 1000n * 10n ** 18n], // huge balance, no price
  ]);
  const meta = new Map<string, AssetMeta>([
    [WETH.toLowerCase(), { decimals: 18, symbol: "WETH", priceUsd: 3000 }],
    [WEIRD.toLowerCase(), { decimals: 18, symbol: "WEIRD", priceUsd: null }],
  ]);

  const r = computeTvl(locked, meta);
  assert.equal(r.tvlUsd, 3000); // only WETH counted
  assert.equal(r.unknownPriceAssets.length, 1);
  assert.equal(r.unknownPriceAssets[0]?.symbol, "WEIRD");
  assert.equal(r.unknownPriceAssets[0]?.valueUsd, 0);
});

test("computeTvl falls back to 18 decimals / unknown price when meta missing", () => {
  const locked = new Map<string, bigint>([[WEIRD.toLowerCase(), 5n * 10n ** 18n]]);
  const r = computeTvl(locked, new Map());
  assert.equal(r.tvlUsd, 0);
  assert.equal(r.unknownPriceAssets.length, 1);
  assert.equal(r.assets[0]?.locked, 5);
});

test("evaluateLevel respects warn/hard boundaries", () => {
  const t = makeThresholds(1_000_000, 0.8); // hard 1M, warn 800k
  assert.equal(t.warnUsd, 800_000);
  assert.equal(evaluateLevel(0, t), "OK");
  assert.equal(evaluateLevel(799_999, t), "OK");
  assert.equal(evaluateLevel(800_000, t), "WARN"); // inclusive
  assert.equal(evaluateLevel(999_999, t), "WARN");
  assert.equal(evaluateLevel(1_000_000, t), "CRITICAL"); // inclusive
  assert.equal(evaluateLevel(5_000_000, t), "CRITICAL");
});

test("makeThresholds defaults to $1M cap / 80% warn", () => {
  const t = makeThresholds();
  assert.equal(t.hardUsd, 1_000_000);
  assert.equal(t.warnUsd, 800_000);
});
