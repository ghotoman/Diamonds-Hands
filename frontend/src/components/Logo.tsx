/// Diamond Hands brandmark — rotated rounded square (a diamond).
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-grid place-items-center" style={{ width: size, height: size }}>
      <span
        className="block rounded-[7px]"
        style={{
          width: size * 0.74,
          height: size * 0.74,
          transform: "rotate(45deg)",
          background: "linear-gradient(135deg,#3D3DFF,#0000FF)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,.35)",
        }}
      />
    </span>
  );
}
