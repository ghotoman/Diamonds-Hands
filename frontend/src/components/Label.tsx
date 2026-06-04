import type { ReactNode } from "react";
import { cx } from "../lib/helpers";

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("text-[12px] font-semibold uppercase tracking-wide text-sub", className)}>
      {children}
    </div>
  );
}
