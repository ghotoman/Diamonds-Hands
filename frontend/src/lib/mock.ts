// Prototype-only mock data (replaced by on-chain reads in Stages 3-4).
import type { Address } from "viem";
import type { Token, Vault } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const addr = (n: number) =>
  ("0x" + n.toString(16).padStart(40, "0")) as Address;

export const MOCK_TOKENS: Token[] = [
  { address: addr(1), sym: "VVV", name: "Venice", color: "#7C3AED", decimals: 18, balance: 1250.5, price: 3.2 },
  { address: addr(2), sym: "AVNT", name: "Aventis", color: "#0EA5E9", decimals: 18, balance: 8400, price: 0.85 },
  { address: addr(3), sym: "UP", name: "Upshift", color: "#00B341", decimals: 18, balance: 320, price: 1.1 },
  { address: addr(4), sym: "MORPHO", name: "Morpho", color: "#2563EB", decimals: 18, balance: 540.2, price: 1.95 },
  { address: addr(5), sym: "ZORA", name: "Zora", color: "#0A0B0D", decimals: 18, balance: 15000, price: 0.012 },
  { address: addr(6), sym: "DEGEN", name: "Degen", color: "#8B5CF6", decimals: 18, balance: 42000, price: 0.018 },
  { address: addr(7), sym: "WETH", name: "Wrapped Ether", color: "#627EEA", decimals: 18, balance: 2.35, price: 3400 },
];

export const tokenBySym = (s: string): Token =>
  MOCK_TOKENS.find((t) => t.sym === s) ?? MOCK_TOKENS[0];

const v = (
  id: number,
  sym: string,
  amount: number,
  mode: "hard" | "soft",
  startDays: number,
  unlockDays: number,
  status: Vault["status"],
  extra: Partial<Vault> = {},
): Vault => ({
  address: addr(0x1000 + id),
  token: tokenBySym(sym),
  amount,
  mode,
  start: NOW - startDays * DAY,
  unlock: NOW + unlockDays * DAY,
  status,
  currentPenalty: 0,
  ...extra,
});

// vaults — covering every state the UI must handle
export const MOCK_VAULTS: Vault[] = [
  v(1, "VVV", 5000, "hard", 47, 13, "active", { checkIns: 41, lastCheckIn: NOW - 1 * DAY }),
  v(2, "AVNT", 12000, "soft", 30, 60, "active", { startPenalty: 20, checkIns: 22, lastCheckIn: NOW - 2 * DAY }),
  v(3, "MORPHO", 300, "hard", 88, 2, "active", { checkIns: 80, lastCheckIn: NOW - 6 * 3600 * 1000 }),
  v(4, "UP", 800, "soft", 92, -2, "unlocked", { startPenalty: 10, checkIns: 60, lastCheckIn: NOW - 3 * DAY }),
  v(5, "ZORA", 9000, "soft", 120, -20, "withdrawn", { startPenalty: 15, checkIns: 95, lastCheckIn: NOW - 21 * DAY }),
];
