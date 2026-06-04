/// Formatting helpers for the UI.

/// Short address form: 0x1234…abcd
export function shortAddr(addr?: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/// bps → percent ("2000" → "20%").
export function bpsToPercent(bps: bigint | number): string {
  const n = typeof bps === "bigint" ? Number(bps) : bps;
  return `${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}%`;
}

/// Human-readable duration from seconds.
export function humanDuration(secs: bigint): string {
  if (secs <= 0n) return "0s";
  const s = Number(secs);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/// Unix timestamp (seconds) → local date-time.
export function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

/// Lock duration (seconds) from a user choice in days.
export function daysToSeconds(days: number): bigint {
  return BigInt(Math.round(days * 86400));
}

/// Unix now in seconds (bigint).
export function nowSec(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
