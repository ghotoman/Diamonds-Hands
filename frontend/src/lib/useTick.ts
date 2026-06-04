import { useEffect, useState } from "react";

/// Global tick so countdowns / penalties stay live. Returns Date.now().
export function useTick(ms = 1000): number {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return Date.now();
}
