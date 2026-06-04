export function Spinner({ size = 24, light }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke={light ? "rgba(255,255,255,.35)" : "#EBECF0"} strokeWidth="3" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke={light ? "#fff" : "#0000FF"}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
