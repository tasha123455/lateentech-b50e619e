type Stat = { label: string; value: string; sub: string; up: boolean };

export function StatsRow({ stats }: { stats: Stat[] }) {
  const cols = stats.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`mb-3 grid ${cols} gap-2`}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-border bg-surface p-3.5">
          <div className="text-[11px] text-text-2">{s.label}</div>
          <div className="mt-1 text-xl font-medium text-text-1">{s.value}</div>
          <div className={`mt-0.5 text-[10px] ${s.up ? "text-business" : "text-[#e07070]"}`}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
