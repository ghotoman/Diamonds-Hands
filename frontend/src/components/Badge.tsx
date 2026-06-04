import type { ReactNode } from "react";
import { cx } from "../lib/helpers";
import { Icon } from "./Icon";
import type { VaultMode } from "../types";

export function ModeBadge({ mode }: { mode: VaultMode }) {
  if (mode === "hard")
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-[#0000FF0F] text-baseblue px-2 py-1 text-[12px] font-bold">
        <Icon name="lock" size={13} stroke={2.4} />
        HARD
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-surface border border-line text-ink px-2 py-1 text-[12px] font-bold">
      <Icon name="shield" size={13} stroke={2.2} />
      SOFT
    </span>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "blue";

const tones: Record<Tone, string> = {
  neutral: "bg-surface border border-line text-sub",
  success: "bg-[#00B3411A] text-success",
  warning: "bg-[#F59E0B1A] text-warning",
  danger: "bg-[#E11D481A] text-danger",
  blue: "bg-[#0000FF0F] text-baseblue",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
