// Static SVG sparkline placeholder — Chart.js gets wired in later.
type Props = { title: string; accent: "marketer" | "business" };

export function RevenueChart({ title, accent }: Props) {
  const stroke = accent === "marketer" ? "var(--marketer)" : "var(--business)";
  const fill = accent === "marketer" ? "var(--marketer-tint)" : "var(--business-tint)";
  return (
    <div className="mb-3 rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-text-1">{title}</div>
        <div className="flex gap-1">
          {["7d", "30d", "90d"].map((p, i) => (
            <span key={p} className={`rounded-full border border-border px-2 py-0.5 text-[10px] ${i === 1 ? "bg-surface-2 text-text-1" : "text-text-2"}`}>{p}</span>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 320 130" className="h-[130px] w-full">
        <defs>
          <linearGradient id={`g-${accent}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity="0.7" />
            <stop offset="100%" stopColor={fill} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 90 L40 75 L80 82 L120 55 L160 60 L200 38 L240 50 L280 28 L320 35 L320 130 L0 130 Z" fill={`url(#g-${accent})`} />
        <path d="M0 90 L40 75 L80 82 L120 55 L160 60 L200 38 L240 50 L280 28 L320 35" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
