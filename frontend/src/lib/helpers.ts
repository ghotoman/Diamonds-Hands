import type { Vault } from "../types";

export const DAY = 24 * 60 * 60 * 1000;

/// fraction of the lock elapsed (0..1), based on start..unlock window.
export function vaultProgress(v: Vault, now: number): number {
  const total = v.unlock - v.start;
  if (total <= 0) return 1;
  const done = now - v.start;
  return Math.max(0, Math.min(1, done / total));
}

export function daysHeld(v: Vault, now: number): number {
  return Math.max(0, Math.floor((now - v.start) / DAY));
}

export function daysTotal(v: Vault): number {
  return Math.max(1, Math.round((v.unlock - v.start) / DAY));
}

export function isUnlocked(v: Vault, now: number): boolean {
  return now >= v.unlock;
}

/// Live penalty percent: startPenalty at lock, 0 at unlock (linear).
/// Mirrors the contract's currentPenaltyBps; recomputed each tick so the UI
/// stays live between on-chain reads. Hard mode / past unlock → 0.
export function currentPenaltyPct(v: Vault, now: number): number {
  if (v.mode !== "soft" || v.startPenalty === undefined) return 0;
  const remainFrac = Math.max(0, (v.unlock - now) / (v.unlock - v.start));
  return v.startPenalty * Math.min(1, remainFrac);
}

/// USD value if a price is known, else undefined.
export function usd(v: Vault): number | undefined {
  return v.token.price === undefined ? undefined : v.token.price * v.amount;
}

export function fmtUsd(n?: number): string {
  if (n === undefined) return "—";
  if (n >= 1000) return "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K";
  return "$" + n.toFixed(0);
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export type Countdown = {
  days: number;
  hrs: number;
  mins: number;
  secs: number;
  done: boolean;
};

export function countdown(targetMs: number, now: number): Countdown {
  let d = Math.max(0, targetMs - now);
  const days = Math.floor(d / DAY);
  d -= days * DAY;
  const hrs = Math.floor(d / 3_600_000);
  d -= hrs * 3_600_000;
  const mins = Math.floor(d / 60_000);
  d -= mins * 60_000;
  const secs = Math.floor(d / 1000);
  return { days, hrs, mins, secs, done: targetMs - now <= 0 };
}

/// Short address: 0x1234…abcd
export function shortAddr(addr?: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function cx(...a: Array<string | false | null | undefined>): string {
  return a.filter(Boolean).join(" ");
}

/// Lock-duration presets (days) shown on the term step. Presets below the
/// factory's live minimum are disabled in the UI; longer terms go via the
/// custom date picker.
export const PRESETS = [
  { label: "1d", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];
