import { baseSepolia } from "wagmi/chains";
import type { Address } from "viem";

import { factoryAbi } from "./abi/factory";
import { vaultAbi } from "./abi/vault";
import { erc20Abi } from "./abi/erc20";

export { factoryAbi, vaultAbi, erc20Abi };

/// Target network (V1 — testnet).
export const TARGET_CHAIN = baseSepolia;
export const CHAIN_ID = baseSepolia.id; // 84532

/// Deployed addresses on Base Sepolia (see docs/deploy.md).
/// FACTORY can be overridden via VITE_FACTORY_ADDRESS.
/// v2 (2026-06-11): min lock 1 day.
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ??
  "0xE0a0836f19d604e3aEEf1c55a59e50e1cE806cC3") as Address;

/// Previous factory deployments. Vaults created there stay readable on the
/// dashboard after the active factory moves on (writes go to FACTORY_ADDRESS).
/// Override / extend via comma-separated VITE_LEGACY_FACTORY_ADDRESSES.
const LEGACY_DEFAULT = "0x89de426deF37Aa34c17f72d6a73229E64dd93e11"; // v1 factory (min 7d)
const legacyEnv = (import.meta.env.VITE_LEGACY_FACTORY_ADDRESSES ?? LEGACY_DEFAULT) as string;
export const FACTORY_ADDRESSES: Address[] = [
  FACTORY_ADDRESS,
  ...(legacyEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Address[]),
].filter((a, i, arr) => arr.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i);

/// v2 implementation (v1: 0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e)
export const VAULT_IMPL_ADDRESS =
  "0xD41FA9D180187C79E220A1C5968Da8E145646f07" as Address;

/// Protocol limits — client-side fallbacks. The UI reads the live values from
/// the factory (useFactoryLimits); these apply only when that read fails.
export const MIN_LOCK_DAYS = 1;
export const MAX_LOCK_DAYS = 1825; // 5 years
export const MIN_USER_PENALTY_BPS = 500; // 5%
export const ABS_MAX_PENALTY_BPS = 3000; // 30%
export const BPS_DENOMINATOR = 10000;

/// BaseScan helpers.
export const EXPLORER = "https://sepolia.basescan.org";
export const explorerAddress = (a: string) => `${EXPLORER}/address/${a}`;
export const explorerTx = (h: string) => `${EXPLORER}/tx/${h}`;
