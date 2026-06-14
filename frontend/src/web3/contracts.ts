import { base, baseSepolia } from "wagmi/chains";
import type { Address } from "viem";

import { factoryAbi } from "./abi/factory";
import { vaultAbi } from "./abi/vault";
import { erc20Abi } from "./abi/erc20";

export { factoryAbi, vaultAbi, erc20Abi };

/// Target network — Base mainnet by default. Set VITE_USE_TESTNET=1 to point
/// the entire app at Base Sepolia (QA / testnet release). All chain-specific
/// addresses below are picked from MAINNET / TESTNET based on this single flag.
const USE_TESTNET = import.meta.env.VITE_USE_TESTNET === "1" || import.meta.env.VITE_USE_TESTNET === "true";
export const TARGET_CHAIN = USE_TESTNET ? baseSepolia : base;
export const CHAIN_ID = TARGET_CHAIN.id; // 8453 (mainnet) | 84532 (sepolia)

/// Per-chain canonical addresses. Override the active factory + legacy list
/// per chain via env (VITE_FACTORY_ADDRESS / VITE_LEGACY_FACTORY_ADDRESSES);
/// defaults below are baked into the bundle so the app works without env on
/// either network once the mainnet factory is published.
type ChainAddrs = {
  /// the ACTIVE factory — new vaults are created here
  factory: Address;
  /// the Vault implementation (informational; clones hardcode this)
  vaultImpl: Address;
  /// known WETH on this chain — the create picker's default lockable token
  weth: Address;
  /// previous factory deployments (read-only; vaults from there stay visible)
  legacy: Address[];
};

const MAINNET: ChainAddrs = {
  // Deployed 2026-06-14 on Base mainnet (block 47318595), both verified.
  // NOTE: these match the Base Sepolia v1 addresses by coincidence — contract
  // addresses are deterministic from (deployer, nonce), and the same deployer
  // key had nonce 0/1 on mainnet. Different chains, no runtime collision.
  factory: "0x89de426deF37Aa34c17f72d6a73229E64dd93e11" as Address,
  vaultImpl: "0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
  legacy: [],
};

const TESTNET: ChainAddrs = {
  // v2 (2026-06-11) — min lock 1 day
  factory: "0xE0a0836f19d604e3aEEf1c55a59e50e1cE806cC3" as Address,
  vaultImpl: "0xD41FA9D180187C79E220A1C5968Da8E145646f07" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
  // v1 (2026-06-04)
  legacy: ["0x89de426deF37Aa34c17f72d6a73229E64dd93e11" as Address],
};

const DEFAULTS = USE_TESTNET ? TESTNET : MAINNET;

export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ?? DEFAULTS.factory) as Address;

const legacyEnv = import.meta.env.VITE_LEGACY_FACTORY_ADDRESSES as string | undefined;
const legacyList = legacyEnv
  ? (legacyEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as Address[])
  : DEFAULTS.legacy;

export const FACTORY_ADDRESSES: Address[] = [FACTORY_ADDRESS, ...legacyList].filter(
  (a, i, arr) => arr.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i,
);

export const VAULT_IMPL_ADDRESS = DEFAULTS.vaultImpl;
export const WETH_ADDRESS = DEFAULTS.weth;

/// Protocol limits — client-side fallbacks. The UI reads the live values from
/// the factory (useFactoryLimits); these apply only when that read fails.
export const MIN_LOCK_DAYS = 1;
export const MAX_LOCK_DAYS = 1825; // 5 years
export const MIN_USER_PENALTY_BPS = 500; // 5%
export const ABS_MAX_PENALTY_BPS = 3000; // 30%
export const BPS_DENOMINATOR = 10000;

/// BaseScan helpers — switches with the active chain.
export const EXPLORER = USE_TESTNET ? "https://sepolia.basescan.org" : "https://basescan.org";
export const explorerAddress = (a: string) => `${EXPLORER}/address/${a}`;
export const explorerTx = (h: string) => `${EXPLORER}/tx/${h}`;
