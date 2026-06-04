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
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ??
  "0x89de426deF37Aa34c17f72d6a73229E64dd93e11") as Address;

export const VAULT_IMPL_ADDRESS =
  "0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e" as Address;

/// Protocol limits (mirror of Factory constants — for client-side validation).
export const MIN_LOCK_DAYS = 7;
export const MAX_LOCK_DAYS = 1825; // 5 years
export const MIN_USER_PENALTY_BPS = 500; // 5%
export const ABS_MAX_PENALTY_BPS = 3000; // 30%
export const BPS_DENOMINATOR = 10000;

/// BaseScan helpers.
export const EXPLORER = "https://sepolia.basescan.org";
export const explorerAddress = (a: string) => `${EXPLORER}/address/${a}`;
export const explorerTx = (h: string) => `${EXPLORER}/tx/${h}`;
