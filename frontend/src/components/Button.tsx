import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/helpers";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "lg" | "md" | "sm";

const sizes: Record<Size, string> = {
  lg: "h-13 px-5 text-[16px] min-h-[52px]",
  md: "h-11 px-4 text-[15px] min-h-[44px]",
  sm: "h-9 px-3 text-[13px] min-h-[36px]",
};

const variants: Record<Variant, string> = {
  primary: "bg-baseblue text-white shadow-cta hover:brightness-110 disabled:bg-line disabled:text-sub",
  secondary: "bg-surface text-ink border border-line hover:bg-[#F2F4F7] disabled:text-sub",
  danger: "bg-danger text-white hover:brightness-105 disabled:bg-line disabled:text-sub",
  ghost: "bg-transparent text-baseblue hover:bg-[#0000FF0D] disabled:text-sub",
};

export function Button({
  variant = "primary",
  size = "lg",
  children,
  loading,
  disabled,
  className = "",
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "relative inline-flex items-center justify-center gap-2 font-semibold rounded-xl select-none transition active:scale-[.985] disabled:pointer-events-none";
  return (
    <button
      className={cx(base, sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      {...rest}
    >
      <span className={cx("inline-flex items-center gap-2", loading && "opacity-0")}>{children}</span>
      {loading && (
        <span className="absolute">
          <Spinner size={20} light={variant === "primary" || variant === "danger"} />
        </span>
      )}
    </button>
  );
}
