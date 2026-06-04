/// Live SVG of the linear penalty decay: startPenalty at lock → 0 at unlock.
export function PenaltyCurve({
  startPenalty,
  progress = 0,
  height = 96,
  showMarker = true,
}: {
  startPenalty: number;
  progress?: number;
  height?: number;
  showMarker?: boolean;
}) {
  const W = 280;
  const H = height;
  const padX = 6;
  const padTop = 14;
  const padBot = 18;
  const x0 = padX;
  const x1 = W - padX;
  const topY = padTop;
  const botY = H - padBot;
  const p = Math.min(1, Math.max(0, progress));
  const mx = x0 + (x1 - x0) * p;
  const my = topY + (botY - topY) * p;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
      <line x1={x0} y1={botY} x2={x1} y2={botY} stroke="#EBECF0" strokeWidth="1.5" />
      <line x1={x0} y1={topY} x2={x1} y2={topY} stroke="#EBECF0" strokeWidth="1" strokeDasharray="3 4" />
      <path d={`M${x0} ${botY} L${x0} ${topY} L${mx} ${my} L${mx} ${botY} Z`} fill="#0000FF14" />
      <line x1={x0} y1={topY} x2={x1} y2={botY} stroke="#0000FF" strokeWidth="2.5" strokeLinecap="round" />
      {showMarker && (
        <>
          <line x1={mx} y1={topY} x2={mx} y2={botY} stroke="#0A0B0D" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
          <circle cx={mx} cy={my} r="5.5" fill="#0000FF" stroke="#fff" strokeWidth="2.5" />
        </>
      )}
      <text x={x0 + 2} y={topY - 4} fontSize="10" fill="#5B616E" fontWeight="600">
        {startPenalty}%
      </text>
      <text x={x1 - 4} y={botY + 13} fontSize="10" fill="#5B616E" textAnchor="end">
        unlock · 0%
      </text>
      <text x={x0 + 2} y={botY + 13} fontSize="10" fill="#5B616E">
        today
      </text>
    </svg>
  );
}
