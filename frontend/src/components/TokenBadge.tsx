/// Token avatar — colored disc with ticker initials (no fake logos).
export function TokenBadge({
  sym,
  color,
  size = 40,
}: {
  sym: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="grid place-items-center rounded-full text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.34,
        letterSpacing: "-.02em",
      }}
    >
      {sym.slice(0, sym.length > 4 ? 1 : 2)}
    </span>
  );
}
