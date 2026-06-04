type Tone = "blue" | "success" | "warning";

const colors: Record<Tone, string> = {
  blue: "#0000FF",
  success: "#00B341",
  warning: "#F59E0B",
};

export function ProgressBar({
  value,
  tone = "blue",
  height = 8,
}: {
  value: number;
  tone?: Tone;
  height?: number;
}) {
  return (
    <div className="w-full rounded-full bg-line overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: Math.max(2, value * 100) + "%", background: colors[tone] }}
      />
    </div>
  );
}
