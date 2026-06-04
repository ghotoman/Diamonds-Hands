import { baseSepolia } from "wagmi/chains";
import type { Address } from "viem";

/// Target network for the app (V1 — testnet).
export const TARGET_CHAIN = baseSepolia;

/// DiamondHandsFactory address on Base Sepolia (see docs/deploy.md).
/// Override via VITE_FACTORY_ADDRESS.
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ??
  "0x89de426deF37Aa34c17f72d6a73229E64dd93e11") as Address;

/// Protocol limits (mirror of Factory constants — for UI validation).
export const MIN_LOCK_DURATION = 7n * 24n * 60n * 60n; // 7 days (sec)
export const MAX_LOCK_DURATION = 1825n * 24n * 60n * 60n; // 5 years (sec)
export const MIN_USER_PENALTY_BPS = 500; // 5%
export const ABS_MAX_PENALTY_BPS = 3000; // 30%
export const BPS_DENOMINATOR = 10000;
