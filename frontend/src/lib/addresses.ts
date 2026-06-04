import { baseSepolia } from "wagmi/chains";
import type { Address } from "viem";

/// Целевая сеть приложения (V1 — тестнет).
export const TARGET_CHAIN = baseSepolia;

/// Адрес DiamondHandsFactory на Base Sepolia (см. docs/deploy.md).
/// Можно переопределить через VITE_FACTORY_ADDRESS.
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ??
  "0x89de426deF37Aa34c17f72d6a73229E64dd93e11") as Address;

/// Лимиты протокола (зеркало констант Factory — для UI-валидации).
export const MIN_LOCK_DURATION = 7n * 24n * 60n * 60n; // 7 дней (сек)
export const MAX_LOCK_DURATION = 1825n * 24n * 60n * 60n; // 5 лет (сек)
export const MIN_USER_PENALTY_BPS = 500; // 5%
export const ABS_MAX_PENALTY_BPS = 3000; // 30%
export const BPS_DENOMINATOR = 10000;
