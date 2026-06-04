// Stage 1 skeleton: phone frame + Base App shell.
// Screens (Dashboard / CreateFlow / VaultDetail) are ported in Stage 2.

export default function App() {
  return (
    <div className="dh-phone font-sans">
      {/* iOS status bar */}
      <div className="h-[26px] px-6 flex items-center justify-between text-[12px] font-semibold text-ink shrink-0 select-none">
        <span>9:41</span>
        <span className="flex items-center gap-1.5">
          <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
            <rect x="0" y="6" width="3" height="5" rx="1" />
            <rect x="4.5" y="4" width="3" height="7" rx="1" />
            <rect x="9" y="2" width="3" height="9" rx="1" />
            <rect x="13.5" y="0" width="3" height="11" rx="1" />
          </svg>
          <svg width="24" height="11" viewBox="0 0 24 11" fill="none">
            <rect x=".5" y=".5" width="20" height="10" rx="3" stroke="currentColor" opacity=".4" />
            <rect x="2" y="2" width="16" height="7" rx="1.5" fill="currentColor" />
            <rect x="21.5" y="3.5" width="1.5" height="4" rx=".75" fill="currentColor" opacity=".4" />
          </svg>
        </span>
      </div>

      {/* Base App host bar */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-line shrink-0 bg-white/80 backdrop-blur">
        <div className="flex items-center gap-2 px-1">
          <span className="inline-grid place-items-center" style={{ width: 26, height: 26 }}>
            <span
              className="block rounded-[7px]"
              style={{
                width: 26 * 0.74,
                height: 26 * 0.74,
                transform: "rotate(45deg)",
                background: "linear-gradient(135deg,#3D3DFF,#0000FF)",
                boxShadow: "inset 0 0 0 2px rgba(255,255,255,.35)",
              }}
            />
          </span>
          <span className="text-[16px] font-bold text-ink tracking-tight">Diamond Hands</span>
        </div>
      </div>

      {/* app surface */}
      <div className="dh-surface flex-1 overflow-y-auto relative bg-white grid place-items-center">
        <div className="text-center text-sub text-[14px] px-8">
          <div className="text-ink font-semibold mb-1">Stage 1 skeleton ✓</div>
          Tailwind tokens + phone shell ready. Screens land in Stage 2.
        </div>
      </div>
    </div>
  );
}
