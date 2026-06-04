/// Утилиты форматирования для UI.

/// Короткий вид адреса: 0x1234…abcd
export function shortAddr(addr?: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/// bps → проценты ("2000" → "20%").
export function bpsToPercent(bps: bigint | number): string {
  const n = typeof bps === "bigint" ? Number(bps) : bps;
  return `${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}%`;
}

/// Человекочитаемая длительность из секунд.
export function humanDuration(secs: bigint): string {
  if (secs <= 0n) return "0с";
  const s = Number(secs);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${mins}м`;
  return `${mins}м`;
}

/// Unix-таймстамп (сек) → локальная дата-время.
export function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

/// Длительность лока (секунды) из выбора пользователя в днях.
export function daysToSeconds(days: number): bigint {
  return BigInt(Math.round(days * 86400));
}

/// Unix now в секундах (bigint).
export function nowSec(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
