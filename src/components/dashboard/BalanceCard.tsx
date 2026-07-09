type Props = {
  label: string;
  amount: number;
  sub: string;
  cta?: string;
  onCta?: () => void;
  meta?: { label: string; value: string }[];
};

export function BalanceCard({ label, amount, sub, cta = "Payout", onCta, meta = [] }: Props) {
  return (
    <div className="mb-3 rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-6">
      <div className="text-[11px] uppercase tracking-wider text-white/35">{label}</div>
      <div className="mt-1.5 text-4xl font-medium text-white">${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div className="mt-1 text-[11px] text-white/30">{sub}</div>
      <div className="mt-5 flex items-center justify-between">
        <div className="space-y-0.5 text-[11px] text-white/30">
          {meta.map((m) => (
            <div key={m.label}>{m.label}: <span className="font-medium text-white/65">{m.value}</span></div>
          ))}
        </div>
        <button onClick={onCta} className="h-9 rounded-full bg-[#f0eeeb] px-4 text-xs font-medium text-[#0d0d0d] hover:opacity-90">{cta}</button>
      </div>
    </div>
  );
}
